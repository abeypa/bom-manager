import React from 'react';
import { Download, FileText, File, FileSpreadsheet, FileCode } from 'lucide-react';
import exportUtils from '../../utils/export';
import { useToast } from '../../context/ToastContext';

interface SectionExportButtonProps {
  sectionName: string;
  parts: any[];           // project_parts rows for this section
  projectName?: string;
}

export default function SectionExportButton({ 
  sectionName, 
  parts, 
  projectName = 'Project' 
}: SectionExportButtonProps) {
  const { showToast } = useToast();

  const handleExportTXT = () => {
    try {
      exportUtils.exportSectionBOMToTXT(sectionName, parts);
      showToast('success', `${sectionName} BOM exported as TXT`);
    } catch (err) {
      showToast('error', 'Failed to export BOM as TXT');
    }
  };

  const handleExportCSV = () => {
    try {
      // CSV export for BOM section
      let csvContent = `BOM - ${sectionName}\n`;
      csvContent += `Generated on,${new Date().toLocaleString('en-IN')}\n\n`;
      csvContent += 'Part Number,Description,Qty,Unit Price,Total\n';

      parts.forEach((p: any) => {
        const details = p.part_ref || {};
        const total = (p.unit_price || 0) * (p.quantity || 0);
        csvContent += `"${details.part_number || '-'}","${(details.description || '-').replace(/"/g, '""')}",${p.quantity || 0},${p.unit_price || 0},${total.toFixed(2)}\n`;
      });

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sectionName}_BOM.csv`;
      a.click();
      URL.revokeObjectURL(url);

      showToast('success', `${sectionName} BOM exported as CSV`);
    } catch (err) {
      showToast('error', 'Failed to export BOM as CSV');
    }
  };

  const handleExportPDF = () => {
    try {
      exportUtils.exportToPDF(`${sectionName}_BOM`);
      showToast('success', `Printing ${sectionName} BOM... (Save as PDF)`);
    } catch (err) {
      showToast('error', 'Failed to generate PDF');
    }
  };

  const handleExportJSON = () => {
    try {
      // Export in the same format suited for import
      const exportData = parts.map((p: any) => ({
        PartNumber: p.part_ref?.part_number,
        Description: p.part_ref?.description || '',
        PartType: p.part_type,
        quantity: p.quantity,
        unit_price: p.unit_price,
        Currency: p.currency,
        projectName: projectName,
        sectionName: sectionName
      }));

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sectionName}_BOM.json`;
      a.click();
      URL.revokeObjectURL(url);

      showToast('success', `${sectionName} BOM exported as JSON`);
    } catch (err) {
      showToast('error', 'Failed to export BOM as JSON');
    }
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={handleExportCSV}
        className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 hover:bg-gray-50 rounded-2xl transition-colors"
      >
        <FileSpreadsheet className="w-4 h-4" />
        CSV
      </button>

      <button
        onClick={handleExportTXT}
        className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 hover:bg-gray-50 rounded-2xl transition-colors"
      >
        <FileText className="w-4 h-4" />
        TXT
      </button>

      <button
        onClick={handleExportPDF}
        className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 hover:bg-gray-50 rounded-2xl transition-colors"
      >
        <File className="w-4 h-4" />
        PDF
      </button>

      <button
        onClick={handleExportJSON}
        className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 hover:bg-gray-50 rounded-2xl transition-colors"
      >
        <FileCode className="w-4 h-4" />
        JSON
      </button>
    </div>
  );
}
