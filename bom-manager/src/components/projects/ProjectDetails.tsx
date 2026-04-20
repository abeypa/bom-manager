import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { projectsApi } from '../../api/projects';
import SectionExportButton from './SectionExportButton';
import { useToast } from '../../context/ToastContext';

export default function ProjectDetails() {
  const { id } = useParams();
  const { showToast } = useToast();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadProject = async () => {
    try {
      const data = await projectsApi.getProject(Number(id));
      setProject(data);
    } catch (err) {
      showToast('error', 'Failed to load project details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) loadProject();
  }, [id]);

  if (loading) return <div className="p-8 text-center text-sm font-bold uppercase tracking-widest text-gray-400">Synchronizing Project Data...</div>;
  if (!project) return <div className="p-8 text-center text-red-500 font-bold uppercase tracking-widest">Project record not found in system</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 text-gray-900">
      <div className="flex justify-between items-center mb-8 bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
        <div>
           <div className="text-[10px] font-black text-primary-600 uppercase tracking-widest mb-1 flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-primary-600 animate-pulse" />
             Project Architecture Overview
           </div>
          <h1 className="text-3xl font-black tracking-tight uppercase leading-none">{project.project_name}</h1>
          <p className="text-gray-400 font-bold text-xs uppercase tracking-[0.2em] mt-2 font-mono">Reference Cluster ID: #{project.project_number}</p>
        </div>
      </div>

      {/* Sections with Export Buttons */}
      <div className="space-y-10">
        {(project.project_sections || project.sections)?.map((section: any) => (
          <div key={section.id} className="border border-gray-100 rounded-[2.5rem] bg-white overflow-hidden shadow-sm hover:shadow-md transition-all">
            {/* Section Header */}
            <div className="px-8 py-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
              <div>
                <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Section Identifier</div>
                <div className="font-black text-xl uppercase tracking-tight text-gray-900 leading-none">{section.section_name}</div>
              </div>
              
              {/* Export BOM for this section */}
              <SectionExportButton
                sectionName={section.section_name}
                parts={section.project_parts || section.parts || []}
                projectName={project.project_name}
              />
            </div>

            {/* Parts Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/30 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
                    <th className="px-8 py-5">Component Reference</th>
                    <th className="px-8 py-5">Design Specifications</th>
                    <th className="px-8 py-5 text-right font-mono">Quantity</th>
                    <th className="px-8 py-5 text-right font-mono">Unit Price</th>
                    <th className="px-8 py-5 text-right font-mono">Incentive %</th>
                    <th className="px-8 py-5 text-right font-mono">Aggregate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(section.project_parts || section.parts || []).map((p: any) => {
                    const total = (p.unit_price || 0) * (p.quantity || 0) * (1 - (p.discount_percent || 0) / 100);
                    // Dynamic part data resolution (matching parts schema)
                    const partNumber = p.mechanical_manufacture?.part_number || 
                                     p.mechanical_bought_out?.part_number || 
                                     p.electrical_manufacture?.part_number || 
                                     p.electrical_bought_out?.part_number || 
                                     p.pneumatic_bought_out?.part_number || p.part_number || 'N/A';
                    const description = p.mechanical_manufacture?.description || 
                                      p.mechanical_bought_out?.description || 
                                      p.electrical_manufacture?.description || 
                                      p.electrical_bought_out?.description || 
                                      p.pneumatic_bought_out?.description || p.description || '-';
                    return (
                      <tr key={p.id} className="hover:bg-gray-50/50 transition-all group">
                        <td className="px-8 py-5 font-black text-gray-900 group-hover:text-primary-600 transition-colors font-mono tracking-tight text-sm">
                          {partNumber}
                        </td>
                        <td className="px-8 py-5 text-gray-500 font-bold text-xs uppercase tracking-tight italic">
                          {description}
                        </td>
                        <td className="px-8 py-5 text-right font-black text-gray-900 text-sm tabular-nums">
                          {p.quantity}
                        </td>
                        <td className="px-8 py-5 text-right font-bold text-gray-400 text-sm tabular-nums">
                          ₹{p.unit_price?.toLocaleString()}
                        </td>
                        <td className="px-8 py-5 text-right text-xs font-black text-emerald-500 tabular-nums">
                          {p.discount_percent || 0}%
                        </td>
                        <td className="px-8 py-5 text-right font-black text-gray-900 text-sm tabular-nums">
                          ₹{total.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
