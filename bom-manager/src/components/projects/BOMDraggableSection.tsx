import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import BOMSectionCard from './BOMSectionCard'

type Props = React.ComponentProps<typeof BOMSectionCard>

const BOMDraggableSection = ({ section, projectId, ...rest }: Props) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: section.id,
  })

  // Disable interaction on the rest of the card to allow normal clicks
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <div 
        {...attributes} 
        {...listeners} 
        className="absolute -left-10 top-6 text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing z-10 p-2"
        title="Drag to reorder"
      >
        <GripVertical className="h-5 w-5" />
      </div>
      <BOMSectionCard section={section} projectId={projectId} {...rest} />
    </div>
  )
}

export default BOMDraggableSection
