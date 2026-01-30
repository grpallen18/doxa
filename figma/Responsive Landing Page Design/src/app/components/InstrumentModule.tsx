interface InstrumentModuleProps {
  title: string;
  value?: string;
  indicator?: boolean;
}

export function InstrumentModule({ title, value, indicator = false }: InstrumentModuleProps) {
  return (
    <div
      className="rounded-[16px] bg-[#e9e6e2] p-6 flex flex-col gap-4"
      style={{
        boxShadow: '6px 6px 18px rgba(0, 0, 0, 0.05), -6px -6px 18px rgba(255, 255, 255, 0.8)'
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm tracking-wide text-[#4a4539] uppercase font-medium">
          {title}
        </span>
        {indicator && (
          <div
            className="w-2 h-2 rounded-full bg-[#c9a55d]"
            style={{
              boxShadow: '0 0 8px rgba(201, 165, 93, 0.6)'
            }}
          />
        )}
      </div>
      
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-full bg-[#e4e1dd] flex items-center justify-center"
          style={{
            boxShadow: 'inset 3px 3px 8px rgba(0, 0, 0, 0.08), inset -3px -3px 8px rgba(255, 255, 255, 0.6)'
          }}
        >
          <div className="w-3 h-3 rounded-full bg-[#8a7f6f]" />
        </div>
        
        <div
          className="flex-1 h-2 rounded-full bg-[#e4e1dd]"
          style={{
            boxShadow: 'inset 2px 2px 6px rgba(0, 0, 0, 0.08), inset -2px -2px 6px rgba(255, 255, 255, 0.6)'
          }}
        >
          <div 
            className="h-full rounded-full bg-[#7eb8b3]"
            style={{ width: value || '60%' }}
          />
        </div>
      </div>
      
      <div className="flex gap-2">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="w-6 h-6 rounded-[6px] bg-[#e4e1dd]"
            style={{
              boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0.06), inset -1px -1px 3px rgba(255, 255, 255, 0.5)'
            }}
          />
        ))}
      </div>
    </div>
  );
}
