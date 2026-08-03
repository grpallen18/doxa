import { NeoDocumentWorkspace } from '@/components/admin/neo/neo-document-workspace'

type PageProps = { params: Promise<{ storyId: string }> }

export default async function AdminNeoDocumentPage({ params }: PageProps) {
  const { storyId } = await params
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <NeoDocumentWorkspace storyId={storyId} />
    </div>
  )
}
