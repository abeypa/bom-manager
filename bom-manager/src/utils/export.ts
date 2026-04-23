export const exportUtils = {
  // BOM of a single section → TXT
  exportSectionBOMToTXT: (sectionName: string, parts: any[]) => {
    let content = `BOM - ${sectionName}\n`;
    content += `Generated on: ${new Date().toLocaleString('en-IN')}\n\n`;
    content += 'Part Number\tDescription\tQty\tUnit Price\tTotal\n';
    content += '----------------------------------------------------------------------------\n';

    parts.forEach((p: any) => {
      const details = p.part_ref || {};
      const unitPrice = p.unit_price || 0;
      const quantity = p.quantity || 0;
      const total = unitPrice * quantity;
      content += `${details.part_number || '-'}\t${details.description || '-'}\t${quantity}\t₹${unitPrice}\t₹${total.toFixed(2)}\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sectionName}_BOM.txt`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // Full Project BOM → TXT
  exportProjectBOMToTXT: (projectName: string, sections: any[]) => {
    let content = `Full BOM - ${projectName}\n`;
    content += `Generated on: ${new Date().toLocaleString('en-IN')}\n\n`;

    sections.forEach((sec: any) => {
      content += `===========================================================\n`;
      content += `SECTION: ${sec.name.toUpperCase()}\n`;
      content += `===========================================================\n\n`;

      sec.subsections?.forEach((sub: any) => {
        content += `--- Sub-Compartment: ${sub.section_name} ---\n`;
        const parts = sub.parts || [];
        if (parts.length === 0) {
          content += `(No parts mapped)\n\n`;
          return;
        }
        parts.forEach((p: any) => {
          const details = p.part_ref || {};
          const unitPrice = p.unit_price || 0;
          const quantity = p.quantity || 0;
          const total = unitPrice * quantity;
          content += `${details.part_number || '-'}\t${details.description || '-'}\t${quantity}\t₹${unitPrice}\t₹${total.toFixed(2)}\n`;
        });
        content += '\n';
      });
      content += '\n';
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}_Full_BOM.txt`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // PO Export → CSV
  exportPOToCSV: (po: any) => {
    // Extract all unique project numbers across all items
    const allUniqueProjectNumbers = new Set<string>();
    (po.purchase_order_items || []).forEach((item: any) => {
      const prjNo = item.project_part?.project_subsection?.section?.project?.project_number;
      if (prjNo) allUniqueProjectNumbers.add(prjNo);
    });

    let csv = `Purchase Order Details\n`;
    csv += `PO Number,${po.po_number}\n`;
    csv += `Project Numbers,"${Array.from(allUniqueProjectNumbers).join(', ')}"\n`;
    csv += `Supplier,"${po.suppliers?.name || '-'}"\n`;
    csv += `Date,${new Date(po.created_date).toLocaleDateString('en-IN')}\n`;
    csv += `Status,${po.status}\n\n`;
    
    // Header for items
    csv += 'Part Number,Manufacturer Part No,Description,Qty,Unit Price,Discount %,Total\n';

    // Group items by part_number to consolidate quantities
    const groupedItems = new Map<string, any>();

    (po.purchase_order_items || []).forEach((item: any) => {
      const pn = item.part_number || 'N/A';

      if (!groupedItems.has(pn)) {
        groupedItems.set(pn, {
          part_number: pn,
          manufacturer_part_number: item.manufacturer_part_number || '-',
          description: item.description,
          unit_price: item.unit_price || 0,
          discount_percent: item.discount_percent || 0,
          quantity: 0
        });
      }

      const grp = groupedItems.get(pn);
      grp.quantity += (item.quantity || 0);
    });

    Array.from(groupedItems.values()).forEach((grp: any) => {
      const total = grp.unit_price * grp.quantity * (1 - grp.discount_percent / 100);
      
      // Escape descriptions that might contain commas
      const escapedDesc = (grp.description || '-').replace(/"/g, '""');
      
      csv += `"${grp.part_number}","${grp.manufacturer_part_number}","${escapedDesc}",${grp.quantity},${grp.unit_price},${grp.discount_percent},${total.toFixed(2)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `PO_${po.po_number}.csv`);
    link.click();
    URL.revokeObjectURL(url);
  },

  // Full Project BOM → HTML Report
  generateHTMLReport: (projectName: string, projectNumber: string, sections: any[]) => {
    const today = new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${projectName} - BOM Report</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,700;0,900;1,400;1,700&display=swap');
        
        body {
            font-family: 'DM Sans', sans-serif;
            color: #1a1a1a;
            line-height: 1.6;
            padding: 40px;
            background: #fdfdfd;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 4px solid #1a3f7c;
            padding-bottom: 30px;
            margin-bottom: 40px;
        }

        .project-info h1 {
            font-size: 32px;
            font-weight: 900;
            margin: 0;
            text-transform: uppercase;
            letter-spacing: -0.02em;
        }

        .project-number {
            display: inline-block;
            background: #1a3f7c;
            color: white;
            padding: 4px 12px;
            border-radius: 8px;
            font-weight: 900;
            font-size: 12px;
            margin-top: 8px;
            letter-spacing: 0.1em;
        }

        .report-meta {
            text-align: right;
        }

        .report-meta p {
            margin: 0;
            font-weight: 700;
            color: #888;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.1em;
        }

        .section {
            margin-bottom: 60px;
        }

        .section-header {
            background: #1a3f7c;
            color: white;
            padding: 15px 25px;
            border-radius: 15px;
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .section-header h2 {
            margin: 0;
            font-size: 18px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .subsection {
            margin-bottom: 30px;
            padding-left: 20px;
            border-left: 2px solid #eee;
        }

        .subsection-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 15px;
        }

        .subsection-header h3 {
            margin: 0;
            font-size: 14px;
            font-weight: 900;
            text-transform: uppercase;
            color: #555;
            letter-spacing: 0.05em;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            background: white;
            box-shadow: 0 4px 6px rgba(0,0,0,0.02);
        }

        th {
            background: #f8f9fb;
            color: #888;
            text-transform: uppercase;
            font-weight: 900;
            font-size: 10px;
            letter-spacing: 0.1em;
            padding: 12px 15px;
            text-align: left;
            border-bottom: 2px solid #eee;
        }

        td {
            padding: 12px 15px;
            border-bottom: 1px solid #f0f0f0;
            vertical-align: middle;
        }

        .part-img {
            width: 40px;
            height: 40px;
            object-fit: contain;
            border-radius: 8px;
            border: 1px solid #eee;
            padding: 2px;
        }

        .part-no {
            font-family: "DM Mono", monospace;
            font-weight: 700;
            color: #1a3f7c;
            white-space: nowrap;
        }

        .mpn {
            font-family: "DM Mono", monospace;
            font-weight: 600;
            color: #666;
            font-size: 11px;
        }

        .desc {
            color: #666;
            max-width: 250px;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .qty {
            font-weight: 900;
            text-align: right;
        }

        .po-status {
            font-weight: 900;
            font-size: 9px;
            padding: 4px 10px;
            border-radius: 6px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            display: inline-block;
        }

        .delivery {
            font-weight: 700;
            font-size: 11px;
            white-space: nowrap;
        }

        .price, .total {
            text-align: right;
            font-weight: 700;
        }

        .footer {
            margin-top: 100px;
            text-align: center;
            color: #ccc;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.2em;
        }

        @media print {
            body { padding: 0; }
            .section { page-break-inside: avoid; }
            button { display: none; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="project-info">
            <h1>${projectName}</h1>
            <div class="project-number">${projectNumber}</div>
        </div>
        <div class="report-meta">
            <p>Bill of Materials Report</p>
            <p style="color: #1a3f7c; font-size: 14px; margin-top: 5px;">${today}</p>
        </div>
    </div>

    ${sections.map((sec: any) => `
        <div class="section">
            <div class="section-header">
                <h2>${sec.name}</h2>
                <div style="font-size: 10px; font-weight: 700;">${sec.subsections?.length || 0} SUB-COMPARTMENTS</div>
            </div>

            ${(sec.subsections || []).map((sub: any) => `
                <div class="subsection">
                    <div class="subsection-header">
                        <div style="width: 8px; height: 8px; border-radius: 2px; background: #1a3f7c;"></div>
                        <h3>${sub.section_name}</h3>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th style="width: 50px;">IMG</th>
                                <th>Part Number</th>
                                <th>Manufacturer Part No</th>
                                <th>Description</th>
                                <th style="text-align: right;">Quantity</th>
                                <th>PO Status</th>
                                <th>Delivery</th>
                                <th style="text-align: right;">Unit Price</th>
                                <th style="text-align: right;">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(sub.parts || []).map((p: any) => {
                                const details = p.part_ref || {};
                                const poInfo = p.po_info;
                                const mpn = details.manufacturer_part_number || details.manufacturer_part_no || '-';
                                const poStatus = poInfo ? (poInfo.status === 'Draft' ? 'PENDING PO' : poInfo.status.toUpperCase()) : 'NOT ORDERED';
                                const received = poInfo?.received_qty || 0;
                                const pending = Math.max(0, p.quantity - received);
                                const delivery = `${received} REC / ${pending} PEND`;
                                const total = (p.unit_price || 0) * (p.quantity || 0);
                                
                                return `
                                    <tr>
                                        <td>
                                            ${details.image_path ? 
                                                `<img src="${details.image_path}" class="part-img" />` : 
                                                `<div class="part-img" style="background: #f9f9f9; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #ccc;">N/A</div>`
                                            }
                                        </td>
                                        <td><span class="part-no">${details.part_number || '-'}</span></td>
                                        <td><span class="mpn">${mpn}</span></td>
                                        <td><div class="desc">${details.description || '-'}</div></td>
                                        <td class="qty">${p.quantity}</td>
                                        <td>
                                            <span class="po-status" style="${
                                                poStatus === 'NOT ORDERED' ? 'background: #f1f5f9; color: #64748b;' :
                                                poStatus === 'PENDING PO' ? 'background: #fff7ed; color: #c2410c;' :
                                                'background: #f0fdf4; color: #15803d;'
                                            }">
                                                ${poStatus}
                                            </span>
                                        </td>
                                        <td class="delivery" style="color: ${pending > 0 ? '#b45309' : '#15803d'};">
                                            ${delivery}
                                        </td>
                                        <td class="price">₹${(p.unit_price || 0).toLocaleString()}</td>
                                        <td class="total">₹${total.toLocaleString()}</td>
                                    </tr>
                                `;
                            }).join('')}
                            ${(sub.parts || []).length === 0 ? `<tr><td colspan="9" style="text-align: center; color: #ccc; font-style: italic; padding: 30px;">No parts mapped to this compartment</td></tr>` : ''}
                        </tbody>
                    </table>
                </div>
            `).join('')}
        </div>
    `).join('')}

    <div class="footer">
        Generated by BEP BOM Manager &bull; Confidential &bull; ${new Date().getFullYear()}
    </div>

    <script>
        // Automatic PDF conversion hint when using browser print
        console.log("HTML Report Generated Successfully");
    </script>
</body>
</html>
    `;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}_Report.html`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // Simple PDF export using browser print (no extra library)
  exportToPDF: (filename: string) => {
    const originalTitle = document.title;
    document.title = filename;
    window.print();
    document.title = originalTitle;
  }
};

export default exportUtils;
