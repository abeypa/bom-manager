import React, { useRef, useState } from 'react';
import { Upload, X, CheckCircle, AlertCircle, FileJson, Download, Loader2 } from 'lucide-react';
import { partsApi, PartCategory } from '@/api/parts';
import { useQueryClient } from '@tanstack/react-query';

interface PartImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: PartCategory;
}

const PartImportModal: React.FC<PartImportModalProps> = ({ isOpen, onClose, activeTab }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    partsProcessed?: number;
    partsAdded?: number;
    partsUpdated?: number;
    errors?: number;
    errorMessages?: string[];
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsProcessing(true);
    setResult(null);

    try {
      const content = await file.text();
      let partsData: any[] = [];
      
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          partsData = parsed;
        } else if (parsed && typeof parsed === 'object') {
          // Check if it's the wrapped format { "parts": [...] } or { "Parts": [...] }
          const wrapper = parsed.parts || parsed.Parts;
          if (wrapper && Array.isArray(wrapper)) {
            partsData = wrapper;
          } else if (parsed.PartNumber || parsed.part_number) {
            // It might be a single part object
            partsData = [parsed];
          } else {
            throw new Error("JSON must be an array of parts or an object with a 'parts' array.");
          }
        } else {
          throw new Error("Invalid JSON format. Expected an array or object.");
        }
      } catch (e: any) {
        throw new Error(e.message || "Invalid JSON format. Please check the file content.");
      }

      const importResult = await partsApi.importParts(partsData);
      setResult(importResult);
      
      // Invalidate queries to refresh the list and dashboard
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      
    } catch (error: any) {
      setResult({
        success: false,
        message: error.message || "An error occurred during import"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadSample = () => {
    const sampleData = [
      {
        "PartType": "MechanicalManufacture",
        "PartNumber": "MM-SAMPLE-001",
        "beperp_part_no": "9101581",
        "description": "ROLLER SHAFT REAR",
        "base_price": 965.00,
        "currency": "INR",
        "supplier_id": 1,
        "manufacturer": "BEP India",
        "material": "EN21",
        "finish": "Natural",
        "weight": 1.25,
        "stock_quantity": 10,
        "min_stock_level": 2
      },
      {
        "PartType": "ElectricalBoughtOut",
        "PartNumber": "EBO-SAMPLE-002",
        "beperp_part_no": "S100",
        "description": "24VDC SMPS 5A",
        "base_price": 1800.00,
        "currency": "INR",
        "manufacturer": "MeanWell",
        "manufacturer_part_number": "LRS-100-24",
        "stock_quantity": 5,
        "min_stock_level": 1
      },
      {
        "PartType": "PneumaticBoughtOut",
        "PartNumber": "PBO-SAMPLE-003",
        "beperp_part_no": "C025",
        "description": "AIR CYLINDER 25x50",
        "base_price": 3200.00,
        "currency": "INR",
        "port_size": "1/4 BSP",
        "operating_pressure": "6-8 Bar",
        "stock_quantity": 2,
        "min_stock_level": 1
      }
    ];
    
    const blob = new Blob([JSON.stringify(sampleData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_parts_import.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true" onClick={onClose}>
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full border border-gray-200">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium leading-6 text-gray-900 flex items-center">
                <Upload className="h-5 w-5 mr-2 text-primary-600" />
                Import Parts from JSON
              </h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-500 transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          <div className="px-4 py-5 sm:p-6 bg-gray-50/50">
            {result ? (
              <div className={`p-4 rounded-md mb-4 ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <div className="flex">
                  <div className="flex-shrink-0">
                    {result.success ? (
                      <CheckCircle className="h-5 w-5 text-green-400" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-400" />
                    )}
                  </div>
                  <div className="ml-3">
                    <h3 className={`text-sm font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                      {result.message}
                    </h3>
                    {result.partsProcessed !== undefined && (
                      <div className={`mt-2 text-sm ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                        <ul className="list-disc pl-5 space-y-1">
                          <li>Processed: {result.partsProcessed}</li>
                          <li>Added: {result.partsAdded}</li>
                          <li>Updated: {result.partsUpdated}</li>
                          {result.errors! > 0 && <li>Errors: {result.errors}</li>}
                        </ul>
                      </div>
                    )}
                    {result.errorMessages && result.errorMessages.length > 0 && (
                      <div className="mt-2 text-xs text-red-600 overflow-y-auto max-h-32">
                        <ul className="list-disc pl-5 space-y-1">
                          {result.errorMessages.slice(0, 10).map((msg, i) => (
                            <li key={i}>{msg}</li>
                          ))}
                          {result.errorMessages.length > 10 && <li>...and {result.errorMessages.length - 10} more errors</li>}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className={`
                    border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-all duration-300
                    ${file ? 'border-primary-500 bg-primary-50 shadow-inner' : 'border-gray-300 hover:border-primary-400 hover:bg-white bg-white shadow-sm'}
                  `}
                >
                  <FileJson className={`mx-auto h-16 w-16 mb-4 ${file ? 'text-primary-500' : 'text-gray-300'}`} />
                  <p className="text-base font-semibold text-gray-800">
                    {file ? file.name : "Click to select or drag & drop JSON file"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Maximum file size: 10MB
                  </p>
                    <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden" 
                    accept=".json"
                    aria-label="Upload JSON file"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={downloadSample}
                    className="flex flex-col items-center justify-center p-4 rounded-xl border border-gray-100 bg-white hover:border-primary-300 hover:shadow-md transition-all group"
                  >
                    <div className="bg-primary-50 p-2 rounded-lg mb-2 group-hover:bg-primary-100 transition-colors">
                      <FileJson className="h-5 w-5 text-primary-600" />
                    </div>
                    <span className="text-xs font-bold text-gray-700">Sample JSON</span>
                    <span className="text-[10px] text-gray-400 mt-1">Raw format</span>
                  </button>

                  <a 
                    href="/templates/Part Input.xlsm"
                    download="Part Input.xlsm"
                    className="flex flex-col items-center justify-center p-4 rounded-xl border border-gray-100 bg-white hover:border-green-300 hover:shadow-md transition-all group"
                  >
                    <div className="bg-green-50 p-2 rounded-lg mb-2 group-hover:bg-green-100 transition-colors">
                      <Download className="h-5 w-5 text-green-600" />
                    </div>
                    <span className="text-xs font-bold text-gray-700">Excel Template</span>
                    <span className="text-[10px] text-gray-400 mt-1">Macro-enabled</span>
                  </a>
                </div>

                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl text-xs text-blue-700 border border-blue-100 leading-relaxed">
                  <div className="flex items-center mb-1 font-bold uppercase tracking-wider text-[10px]">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Pro tip:
                  </div>
                  Updates existing parts if Part Number matches, otherwise creates new records. Use the <strong>Excel Template</strong> for bulk data entry then export as JSON.
                </div>
              </div>
            )}
          </div>

          <div className="bg-white px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t border-gray-100 gap-3">
            {!result ? (
              <>
                <button
                  type="button"
                  disabled={!file || isProcessing}
                  onClick={handleUpload}
                  className={`
                    w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-sm font-medium text-white transition-all
                    ${!file || isProcessing 
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500'}
                  `}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="-ml-1 mr-2 h-4 w-4" />
                      Import & Process
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:text-sm transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartImportModal;
