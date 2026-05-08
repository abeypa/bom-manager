/**
 * Orchestration loop for the AI agent.
 *
 *   1. Send the chat history + tool list to OpenRouter.
 *   2. If the model returns a content reply, push it to the chat.
 *   3. If the model returns tool_calls:
 *        - read tools  → execute immediately, push tool result, loop.
 *        - write tools → enqueue a PendingAction in the store and STOP.
 *          The user must Approve before we send the tool result back.
 *
 *   The user's Approve button calls `executePendingAction` which runs
 *   the actual handler then re-enters this loop.
 */

import { chatCompletion, ORMessage } from '@/lib/openrouter'
import {
  TOOL_REGISTRY,
  findTool,
  toOpenAITools,
  sanitizeHTML,
} from '@/lib/ai-tools'
import { useAIStore, ChatMessage, PendingAction } from '@/store/useAIStore'
import type { Attachment } from '@/lib/ai-attachments'

const SYSTEM_PROMPT = `You are the BOM Manager AI assistant for Bharath Engineering Pvt Ltd.

You can call tools to inspect the database (read tools) and to propose
changes (write tools). FOLLOW THESE RULES STRICTLY:

1. NEVER assume — always look up real data with read tools before answering
   questions about projects, parts, POs, or stock. Cite IDs and part numbers
   from tool results, not from memory.

2. NEVER perform a write action silently. Every write tool will be queued
   for explicit user approval. After calling a write tool, summarize what
   you proposed and wait. Do NOT chain a second write tool without the user
   confirming the first one ran.

3. For ambiguous requests (e.g. "add a motor to the project"), ASK before
   you act — list candidate parts/projects and confirm.

4. Confirm before destructive actions (status changes to Cancelled, qty
   reductions, large stock_out). State the impact in plain English.

5. When asked for a report, prefer calling render_html_report with a clean
   Tailwind-styled HTML table. No <script> tags, no inline event handlers.

6. Currency is INR unless otherwise specified. Format numbers with
   en-IN locale.

7. If a tool returns an error, do not retry blindly — explain the error
   to the user and ask how to proceed.

8. The user may attach images (screenshots of POs, invoices, BOM tables,
   handwritten notes) or PDFs (PDF text is pre-extracted and inlined as
   text). When an attachment is present, READ IT CAREFULLY before
   answering. If a screenshot shows a part / PO / supplier, look up the
   real record with a read tool before proposing any write — never type
   IDs from the picture without verifying them in the database.

═══════════════════════════════════════════════════════════════════════
WORKFLOW: INGESTING A PURCHASE ORDER PDF
═══════════════════════════════════════════════════════════════════════

When the user attaches a PO PDF (or screenshot) and asks to add the
parts, follow these steps in order. Stop and ask the user whenever you
are not sure — do NOT guess.

A. EXTRACT FROM THE PDF
   - Supplier name, GSTIN, address.
   - PO date (this becomes last_price_date for every line item).
   - For each line: ITEM CODE (= ERP Integration ID), ITEM DESCRIPTION,
     QTY, UNIT PRICE, DISCOUNT %.

B. RESOLVE THE SUPPLIER
   1. find_supplier_by_name with the supplier name from the PDF.
   2. If no match → propose create_supplier (include GSTIN in notes).

C. FOR EACH LINE ITEM (process them ONE AT A TIME)
   1. find_master_part_by_erp_id with the Item Code.
      - If found → just propose update_master_part_price with the new
        price / discount / last_price_date. Skip to step D.
      - If not found → continue.
   2. Determine the part_type from the description and the prefix system:
        EBO = electrical_bought_out
        EMF = electrical_manufacture
        MBO = mechanical_bought_out
        MMF = mechanical_manufacture
        PBO = pneumatic_bought_out
      Heuristics:
        - "auxiliary switch", "circuit breaker", "contactor", "relay",
          "PLC", "motor drive", cable, terminal → electrical_bought_out
        - cylinder, pneumatic valve, FRL, fitting → pneumatic_bought_out
        - bearing, fastener, bushing, gear, chain → mechanical_bought_out
        - in-house fabricated/machined → *_manufacture
      If you are NOT confident, ASK the user.
   3. get_next_internal_part_number with the prefix (e.g. EBO).
   4. search_image_url with a short query like
      "<manufacturer> <manufacturer_part_number> <description first words>".
      If found, use that URL for image_path. If not, leave image_path null.
   5. Try to extract a manufacturer_part_number from the description
      (e.g. "5ST3010" or "5SY1...FP/FR"). Put it in
      manufacturer_part_number; the Item Code goes in beperp_part_no.
   6. Propose create_master_part with all gathered info, currency = INR
      (unless the PDF says otherwise), last_price_date = PO date.

D. AFTER ALL PARTS EXIST
   Ask the user which project to add them to (call list_projects to
   show options).

E. MAP TO PROJECT STRUCTURE
   1. get_project_structure for the chosen project.
   2. For each part, decide which existing subsection fits (match by
      keyword, e.g. "Electrical → Control Panel"). If nothing fits:
        - Propose create_project_section if no relevant top-level
          section exists, then
        - Propose create_project_subsection under it.
      Always SHOW the user the proposed structure before creating new
      sections — they may prefer an existing one.
   3. Propose add_part_to_project for each line, using the qty + price
      from the PDF.

BATCH BEHAVIOUR
   - You CAN propose several writes in one assistant turn (one per
     tool_call). The user will see them stacked in the approval queue
     and can approve them in bulk.
   - However: if a later write depends on the OUTPUT of an earlier one
     (e.g. add_part_to_project needs the subsection_id from
     create_project_subsection), do NOT chain them — propose the first
     write only, wait for approval, then continue.

PRINT THE PLAN FIRST
   Before queuing any write, give the user a short numbered plan
   ("I will create supplier X, then 3 master parts, then map them under
   subsection Y"). Wait for "go ahead" if the plan is large (>5 writes).

You are working for a procurement engineer; be concise and factual.`

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function ensureSystemMessage() {
  const { messages, setMessages } = useAIStore.getState()
  if (messages.some(m => m.role === 'system')) return
  setMessages([
    {
      id: 'sys',
      role: 'system',
      content: SYSTEM_PROMPT,
      ts: Date.now(),
    },
    ...messages,
  ])
}

function pendingForCall(tc: { id: string; function: { name: string; arguments: string } }): PendingAction | null {
  const tool = findTool(tc.function.name)
  if (!tool || tool.kind !== 'write') return null
  let args: any = {}
  try { args = JSON.parse(tc.function.arguments || '{}') } catch {}
  return {
    id: uid(),
    tool_call_id: tc.id,
    tool_name: tool.name,
    args,
    summary: tool.summarize ? tool.summarize(args) : `${tool.name}(${tc.function.arguments})`,
    status: 'pending',
    ts: Date.now(),
  }
}

/**
 * Send the user's prompt, then process model responses (with auto-loop for
 * read-tool calls) until the model finishes or queues a write tool.
 */
export async function sendUserMessage(text: string, attachments?: Attachment[]) {
  const store = useAIStore.getState()
  ensureSystemMessage()

  store.pushMessage({
    id: uid(),
    role: 'user',
    content: text,
    attachments: attachments && attachments.length ? attachments : undefined,
    ts: Date.now(),
  })

  await runLoop()
}

/** After a write tool is approved+executed, feed the result back to the model. */
export async function feedToolResultAndContinue(p: PendingAction) {
  const store = useAIStore.getState()
  store.pushMessage({
    id: uid(),
    role: 'tool',
    tool_call_id: p.tool_call_id,
    content: JSON.stringify(p.error ? { error: p.error } : { ok: true, result: p.result }),
    ts: Date.now(),
  })
  await runLoop()
}

async function runLoop() {
  const store = useAIStore.getState()
  store.setBusy(true)
  try {
    // Hard cap to stop runaway loops
    for (let step = 0; step < 8; step++) {
      const wire = useAIStore.getState().asWireMessages() as ORMessage[]
      const resp = await chatCompletion({
        messages: wire,
        tools: toOpenAITools() as any,
      })
      const choice = resp.choices?.[0]?.message
      if (!choice) break

      // Push assistant message (content may be null when only tools called)
      const assistantMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        content: choice.content || '',
        tool_calls: choice.tool_calls,
        ts: Date.now(),
      }

      // If render_html_report was called, hoist its arg into the assistant msg
      const htmlCall = choice.tool_calls?.find(tc => tc.function.name === 'render_html_report')
      if (htmlCall) {
        try {
          const a = JSON.parse(htmlCall.function.arguments || '{}')
          assistantMsg.html = { title: a.title || 'Report', html: sanitizeHTML(a.html || '') }
        } catch {}
      }

      useAIStore.getState().pushMessage(assistantMsg)

      const toolCalls = choice.tool_calls || []
      if (toolCalls.length === 0) return  // model finished

      // Separate write vs read calls
      const writePendings: PendingAction[] = []
      for (const tc of toolCalls) {
        const tool = findTool(tc.function.name)
        if (!tool) {
          // Unknown tool — feed an error back to model
          useAIStore.getState().pushMessage({
            id: uid(),
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({ error: `Unknown tool: ${tc.function.name}` }),
            ts: Date.now(),
          })
          continue
        }

        if (tool.kind === 'write') {
          const p = pendingForCall(tc)
          if (p) writePendings.push(p)
          continue
        }

        // READ tool — execute now
        let args: any = {}
        try { args = JSON.parse(tc.function.arguments || '{}') } catch {}
        try {
          const result = await tool.handler(args)
          // render_html_report returns { title, html } — keep tool message terse
          const payload = tc.function.name === 'render_html_report'
            ? { ok: true, rendered: true }
            : { ok: true, result }
          useAIStore.getState().pushMessage({
            id: uid(),
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(payload).slice(0, 50_000),
            ts: Date.now(),
          })
        } catch (err: any) {
          useAIStore.getState().pushMessage({
            id: uid(),
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({ error: err?.message || String(err) }),
            ts: Date.now(),
          })
        }
      }

      if (writePendings.length > 0) {
        for (const p of writePendings) useAIStore.getState().addPending(p)
        // Stop the loop until user approves; the approval handler will
        // re-enter via feedToolResultAndContinue.
        return
      }
      // else: read tools handled, continue loop so model can use the result
    }
  } catch (err: any) {
    useAIStore.getState().pushMessage({
      id: uid(),
      role: 'assistant',
      content: `**Error:** ${err?.message || String(err)}`,
      ts: Date.now(),
    })
  } finally {
    useAIStore.getState().setBusy(false)
  }
}

export async function approvePending(p: PendingAction) {
  const store = useAIStore.getState()
  const tool = findTool(p.tool_name)
  if (!tool) return
  store.updatePending(p.id, { status: 'approved' })
  store.setBusy(true)
  try {
    const result = await tool.handler(p.args)
    store.updatePending(p.id, { status: 'executed', result })
    await feedToolResultAndContinue({ ...p, status: 'executed', result })
  } catch (err: any) {
    const msg = err?.message || String(err)
    store.updatePending(p.id, { status: 'failed', error: msg })
    await feedToolResultAndContinue({ ...p, status: 'failed', error: msg })
  } finally {
    store.setBusy(false)
  }
}

export async function rejectPending(p: PendingAction, reason = 'User rejected this action.') {
  const store = useAIStore.getState()
  store.updatePending(p.id, { status: 'rejected', error: reason })
  store.pushMessage({
    id: uid(),
    role: 'tool',
    tool_call_id: p.tool_call_id,
    content: JSON.stringify({ error: reason, rejected: true }),
    ts: Date.now(),
  })
  // Re-enter loop so the model can react to the rejection
  await runLoop()
}

export const TOOL_DESCRIPTIONS = TOOL_REGISTRY.map(t => ({
  name: t.name,
  kind: t.kind,
  description: t.description,
}))
