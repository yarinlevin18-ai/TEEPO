import { Folder, FolderOpen, FileText, ChevronLeft } from "lucide-react"

export function HeroVisual() {
  return (
    <div className="relative w-full max-w-xl">
      {/* Laptop frame */}
      <div className="relative transform -rotate-2">
        {/* Screen */}
        <div className="bg-card rounded-xl shadow-2xl border border-border overflow-hidden">
          {/* Browser bar */}
          <div className="bg-secondary px-4 py-2 flex items-center gap-2 border-b border-border">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
            </div>
            <div className="flex-1 mx-4">
              <div className="bg-muted rounded px-3 py-1 text-xs text-muted-foreground text-center" dir="ltr">
                app.teepo.io/brain
              </div>
            </div>
          </div>
          
          {/* App content - Brain view */}
          <div className="p-4 min-h-[280px] bg-card">
            {/* Sidebar + Main content */}
            <div className="flex gap-4" dir="ltr">
              {/* Mini sidebar */}
              <div className="w-12 flex flex-col items-center gap-3 py-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                  </svg>
                </div>
                <div className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center">
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2"/>
                    <path d="M16 2v4M8 2v4M3 10h18" strokeWidth="2"/>
                  </svg>
                </div>
                <div className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center">
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M9 11l3 3L22 4" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" strokeWidth="2"/>
                  </svg>
                </div>
              </div>
              
              {/* Brain tree visualization */}
              <div className="flex-1">
                <div className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1">
                  <span>Brain</span>
                  <ChevronLeft className="w-3 h-3" />
                  <span>Google Drive</span>
                </div>
                
                {/* Tree structure */}
                <div className="space-y-2">
                  {/* Root folder */}
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-5 h-5 text-primary" />
                    <span className="text-sm font-medium">My Studies</span>
                  </div>
                  
                  {/* Level 1 - Courses */}
                  <div className="mr-6 space-y-1.5">
                    <div className="flex items-center gap-2 p-1.5 rounded-lg bg-primary/5 border border-primary/20">
                      <FolderOpen className="w-4 h-4 text-primary" />
                      <span className="text-sm">Linear Algebra</span>
                      <span className="text-xs text-muted-foreground mr-auto">12 files</span>
                    </div>
                    
                    {/* Nested files */}
                    <div className="mr-6 space-y-1">
                      <div className="flex items-center gap-2 p-1 rounded hover:bg-muted/50">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs">lecture_notes_week1.pdf</span>
                      </div>
                      <div className="flex items-center gap-2 p-1 rounded hover:bg-muted/50">
                        <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs">homework_3.docx</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted/50">
                      <Folder className="w-4 h-4 text-accent" />
                      <span className="text-sm">Data Structures</span>
                      <span className="text-xs text-muted-foreground mr-auto">8 files</span>
                    </div>
                    
                    <div className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted/50">
                      <Folder className="w-4 h-4 text-accent" />
                      <span className="text-sm">Intro to CS</span>
                      <span className="text-xs text-muted-foreground mr-auto">15 files</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Laptop base */}
        <div className="h-3 bg-gradient-to-b from-border to-muted rounded-b-xl mx-8" />
        <div className="h-1 bg-muted rounded-b-lg mx-16" />
      </div>
      
      {/* Floating elements for depth */}
      <div className="absolute -top-4 -left-4 bg-card rounded-xl shadow-lg border border-border p-3 transform rotate-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
          </div>
          <div>
            <div className="text-xs font-medium">Task completed</div>
            <div className="text-[10px] text-muted-foreground">Linear Algebra HW</div>
          </div>
        </div>
      </div>
      
      <div className="absolute -bottom-2 -right-2 bg-card rounded-xl shadow-lg border border-border p-3 transform -rotate-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2"/>
              <path d="M16 2v4M8 2v4M3 10h18" strokeWidth="2"/>
            </svg>
          </div>
          <div>
            <div className="text-xs font-medium">Tomorrow 10:00</div>
            <div className="text-[10px] text-muted-foreground">Data Structures Exam</div>
          </div>
        </div>
      </div>
    </div>
  )
}
