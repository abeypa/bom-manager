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
   to the user and ask how to proceed. Every write tool runs software
   interlocks (range checks, existence checks, duplicate checks,
   cross-project guards). Treat any error from a tool as a true
   business-rule violation, not a transient fault.

8. The user may attach images (screenshots of POs, invoices, BOM tables,
   handwritten notes) or PDFs (PDF text is pre-extracted and inlined as
   text). When an attachment is present, READ IT CAREFULLY before
   answering. If a screenshot shows a part / PO / supplier, look up the
   real record with a read tool before proposing any write — never type
   IDs from the picture without verifying them in the database.

9. PO STATUS IS HUMAN-ONLY. You can create DRAFT POs (create_draft_po
   only) but you cannot release, send, confirm, partially-receive or
   cancel a PO. The user does that from the Purchase Orders screen
   after reviewing the draft. Never imply you have set a status — the
   tool always lands the PO at status="Draft".

═══════════════════════════════════════════════════════════════════════
INTENT DISPATCH — CHOOSE THE RIGHT WORKFLOW BEFORE DOING ANYTHING
═══════════════════════════════════════════════════════════════════════

When the user attaches a PO PDF/image, they may want very different
things. Read their wording carefully BEFORE proposing any plan.

  Phrase the user typed                    → Run workflow
  ───────────────────────────────────────── ───────────────────────
  "ingest", "add this PO", "import",       → INGEST PO (steps A–F)
   "digitise", "process this PO" with no
   stock context.

  "stock in", "stock out", "in and out",   → STOCK MOVEMENT ONLY
   "in/out", "receive these", "issue to    → (workflow G below)
   project X", "PO is released, only in
   and out", "log receipt", "consume".
   In this mode you do NOT create supplier,
   master parts, project structure or PO.

  "reconcile", "report", "show",           → READ-ONLY ANALYSIS
   "compare", "summarise".                   (use read tools, then
                                              render_html_report)

  Anything ambiguous                       → ASK before acting.

If the user explicitly says "do NOT create X" or "X is already in the
system" or "this is just for stock", DO NOT propose creating X — even
if your default workflow would. The user's phrasing wins.

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
   ABSOLUTE RULE: never create the same master part twice. Before
   proposing create_master_part you MUST run find_master_part_by_erp_id
   (it scans every part_type) AND verify by manufacturer_part_number
   if you have one. The create_master_part tool also rejects duplicates
   on (part_number / beperp_part_no / manufacturer_part_number) across
   every category in code — but you should catch them in the lookup
   step so the user only sees relevant proposals.

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
   3. INTERNAL PART NUMBER RULE (deterministic, do NOT invent or
      sequence-number):
            part_number = "<PREFIX>-<beperp_part_no>"
        e.g. ERP item code 9101689, electrical_bought_out  →
            part_number = "EBO-9101689"
      The create_master_part tool computes this automatically from
      part_type + beperp_part_no — DO NOT pass part_number yourself.
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

E. MAP TO PROJECT STRUCTURE — MAP ONLY, NEVER CREATE, NEVER DUPLICATE
   ABSOLUTE RULES while mapping parts to a project:
     a) NEVER create master parts during mapping. add_part_to_project
        requires a part_id that already exists in the master table; if
        you can't find one, STOP and ask the user. Do NOT propose
        create_master_part as part of mapping — master-part creation
        only happens during the PO PDF ingestion workflow above
        (steps A–C), where it is the explicit purpose of the request.
     b) NEVER map the same master part to a project twice. Before
        proposing add_part_to_project, fetch the project's BOM with
        get_project_details and check whether the (part_type, part_id)
        is already present anywhere in that project. If it is, propose
        update_part_quantity (to bump qty) or move_part_to_subsection
        instead — and tell the user which existing line you found.

   1. get_project_structure for the chosen project.
   2. For each part, find_master_part_by_erp_id (or search_master_parts)
      to confirm the master record exists and capture its id. If a
      part is NOT in master, list those missing items to the user and
      ask whether they want to (a) skip them, (b) ingest a PO PDF
      that contains them, or (c) create them manually one-by-one with
      create_master_part. Do NOT auto-create.
   3. Decide which existing subsection fits each part (match by
      keyword, e.g. "Electrical → Control Panel"). If nothing fits:
        - Propose create_project_section if no relevant top-level
          section exists, then
        - Propose create_project_subsection under it.
      Always SHOW the user the proposed structure before creating new
      sections — they may prefer an existing one.
   4. Propose add_part_to_project for each line, using the verified
      part_id, plus qty + price from the source.

F. DRAFT THE PO FROM THE SAME SOURCE PDF
   ABSOLUTE RULES:
     a) Always do this AFTER the project_parts have been saved
        (i.e. after the user approves all add_part_to_project calls).
        You need the new project_part_ids to reference.
     b) GST / CGST / SGST is NOT included. Do not add tax lines, do not
        add tax to grand_total, do not include taxes anywhere. The
        commercial value is qty × unit_price × (1 − discount%).
     c) The status is locked to "Draft" by the tool. You cannot set it
        to anything else.
     d) Per-line interlocks (enforced in code, not just in this prompt):
          - project_part_id must belong to the same project as the PO.
          - unit_price you pass MUST equal the price stored on the
            project_part (the BOM line). If they differ, fix the BOM
            with update_part_quantity first, or re-read the PDF.
          - You must also pass expected_price_from_source per line —
            this is the unit price you read off the PDF. The tool
            rejects the draft if it differs from unit_price. This is
            the cross-check between (mapped BOM price) and (PDF price).
          - The master part behind each project_part must have
            supplier_id equal to the PO supplier_id; one PO = one
            supplier. The tool rejects mixed-supplier drafts.
          - Each project_part_id may appear at most once in items[].

   Steps:
     1. Confirm the supplier_id from step B and the supplier name as
        printed on the PDF. Pass that as expected_supplier_name.
     2. Use po_date from the PDF. Optionally pass po_number from the
        PDF document number (e.g. PO/P/25-26/100255); otherwise the
        tool generates a CPO-NNNNNNNN.
     3. Build items[] from the PDF's line table (NOT from any tax
        rows). For each row, pass project_part_id (the id returned by
        the earlier add_part_to_project), quantity, unit_price (= PDF),
        discount_percent (= PDF), expected_price_from_source (= PDF).
     4. Propose create_draft_po and wait for user approval.

   When the user approves, the new PO appears under
   /purchase-orders in Draft state. They can attach the source PDF as
   the BEP PO PDF and release it manually — the AI never does that.

═══════════════════════════════════════════════════════════════════════
WORKFLOW G: STOCK MOVEMENT FROM AN ALREADY-RELEASED PO
═══════════════════════════════════════════════════════════════════════

Triggered when the user uploads a PO PDF/image and asks for stock
movements only ("in and out", "stock in", "issue to project X", etc.).

ABSOLUTE RULES — DO NOT VIOLATE EVEN IF YOU THINK IT'S "HELPFUL":
  • Do NOT create a supplier. supplier_id is OPTIONAL on stock_in;
    omit it. Carry the supplier name in reference_notes if useful.
  • Do NOT create master parts. If a line item's ERP code is not in
    master, STOP and list the missing items to the user. Ask:
    "These lines aren't in part master — should I skip them, or do
    you want to ingest them via the normal PO workflow first?"
    Wait for an answer.
  • Do NOT propose create_draft_po, create_master_part,
    create_supplier, create_project_section/subsection or
    add_part_to_project in this mode.
  • Do NOT change PO status — those POs are already released
    externally; we are just logging stock movements.

Steps:
  1. Resolve the project the user named (e.g. "JPM"):
       find_project_by_name with the user's term. If multiple match,
       show them and ask. Capture project_id and project_name.
  2. Resolve the PO number printed on the PDF (e.g. PO/P/25-26/100172).
     This goes into stock_in.po_number / stock_out.reference_notes
     for traceability.
  3. For each line in the PDF:
       a. find_master_part_by_erp_id with the Item Code.
       b. If found → record (part_type, part_id, part_number, qty).
       c. If NOT found → add to a "missing" list; do NOT create.
  4. Show a short plan to the user before queueing writes:
       "I will stock_in N parts and stock_out the same N parts to
       project JPM. M lines are not in master and will be skipped
       unless you tell me otherwise."
  5. After the user confirms, propose all writes in a single batch:
       - stock_in for every found line (use po_number, supplier name
         in reference_notes; omit supplier_id since suppliers are not
         being created).
       - stock_out for the same line linked to project_id.
     The user can Approve all from the chat panel.

If the user only says "stock in" (not "in and out"), skip the
stock_out half. If they only say "stock out", skip the stock_in half.

Stock-out interlock note: stock_out is rejected when stock would go
negative. If you queue stock_in and stock_out for the same item in the
same batch, the user must approve stock_in FIRST so stock is available
when stock_out runs. State this ordering in your plan.

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
          // Run preflight (if any) BEFORE queueing for user approval.
          // A failing preflight means the proposal would be rejected at
          // approval time anyway (duplicate, missing master, etc.), so we
          // suppress the approval card and feed the error back to the
          // model so it can re-plan (e.g. switch from create_master_part
          // to update_master_part_price).
          if (tool.preflight) {
            let args: any = {}
            try { args = JSON.parse(tc.function.arguments || '{}') } catch {}
            try {
              await tool.preflight(args)
            } catch (err: any) {
              useAIStore.getState().pushMessage({
                id: uid(),
                role: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify({
                  error: err?.message || String(err),
                  preflight_failed: true,
                  hint: 'Re-plan based on this error. Do NOT propose the same write again — adjust the action or ask the user.',
                }),
                ts: Date.now(),
              })
              continue
            }
          }
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
