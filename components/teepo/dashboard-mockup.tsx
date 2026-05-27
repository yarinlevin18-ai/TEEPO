import { CheckCircle2, Circle, Calendar, TrendingUp, Brain, ListTodo, GraduationCap } from "lucide-react"

export function DashboardMockup() {
  return (
    <div className="relative w-full max-w-5xl mx-auto">
      {/* Main dashboard */}
      <div className="bg-card rounded-2xl shadow-2xl border border-border overflow-hidden">
        {/* Browser bar */}
        <div className="bg-secondary px-4 py-2.5 flex items-center gap-2 border-b border-border">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 mx-4">
            <div className="bg-muted rounded-lg px-4 py-1.5 text-sm text-muted-foreground text-center max-w-xs mx-auto" dir="ltr">
              app.teepo.io
            </div>
          </div>
        </div>
        
        {/* App layout */}
        <div className="flex min-h-[400px]" dir="ltr">
          {/* Sidebar */}
          <div className="w-48 bg-secondary/50 border-l border-border p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground">
              <Brain className="w-4 h-4" />
              <span className="text-sm font-medium" dir="ltr">Brain</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span className="text-sm">Calendar</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted text-muted-foreground">
              <ListTodo className="w-4 h-4" />
              <span className="text-sm">Tasks</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted text-muted-foreground">
              <GraduationCap className="w-4 h-4" />
              <span className="text-sm">Grades</span>
            </div>
          </div>
          
          {/* Main content */}
          <div className="flex-1 p-6">
            <div className="grid grid-cols-2 gap-6">
              {/* Tasks widget */}
              <div className="bg-background rounded-xl p-4 border border-border">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <ListTodo className="w-4 h-4 text-primary" />
                  Tasks
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-sm line-through text-muted-foreground">Submit HW 3</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Circle className="w-4 h-4 text-accent" />
                    <span className="text-sm">Study for exam</span>
                    <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded mr-auto">urgent</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Circle className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Read chapter 5</span>
                  </div>
                </div>
              </div>
              
              {/* Calendar widget */}
              <div className="bg-background rounded-xl p-4 border border-border">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  This Week
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="font-medium">Mon</span>
                    <span className="text-muted-foreground">Linear Algebra 10:00</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 rounded-full bg-accent" />
                    <span className="font-medium">Wed</span>
                    <span className="text-muted-foreground">Data Structures Exam</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="font-medium">Thu</span>
                    <span className="text-muted-foreground">Office Hours 14:00</span>
                  </div>
                </div>
              </div>
              
              {/* Grades widget */}
              <div className="col-span-2 bg-background rounded-xl p-4 border border-border">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Recent Grades
                </h3>
                <div className="flex gap-4">
                  <div className="flex-1 bg-muted/50 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">Linear Algebra</div>
                    <div className="text-2xl font-bold text-primary">92</div>
                  </div>
                  <div className="flex-1 bg-muted/50 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">Data Structures</div>
                    <div className="text-2xl font-bold text-primary">88</div>
                  </div>
                  <div className="flex-1 bg-muted/50 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">Intro to CS</div>
                    <div className="text-2xl font-bold text-primary">95</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Floating card - Task */}
      <div className="absolute -top-6 right-10 bg-card rounded-xl shadow-xl border border-border p-4 transform rotate-3 hover:rotate-0 transition-transform">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <ListTodo className="w-5 h-5 text-accent" />
          </div>
          <div>
            <div className="text-sm font-medium">Submit Project</div>
            <div className="text-xs text-muted-foreground">Due in 2 days</div>
          </div>
        </div>
      </div>
      
      {/* Floating card - Calendar event */}
      <div className="absolute -bottom-6 left-10 bg-card rounded-xl shadow-xl border border-border p-4 transform -rotate-3 hover:rotate-0 transition-transform">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-sm font-medium">Office Hours</div>
            <div className="text-xs text-muted-foreground">Today at 14:00</div>
          </div>
        </div>
      </div>
    </div>
  )
}
