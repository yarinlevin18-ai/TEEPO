import Link from "next/link"
import { ArrowRight, Link as LinkIcon, RefreshCw, Target, Brain, Calendar, ListTodo, BarChart3 } from "lucide-react"
import { Logo } from "@/components/teepo/logo"
import { HeroVisual } from "@/components/teepo/hero-visual"
import { DashboardMockup } from "@/components/teepo/dashboard-mockup"
import { HeroReveal, HeroRevealItem } from "@/components/patterns/hero-reveal"
import { ScrollStagger, ScrollStaggerItem } from "@/components/patterns/scroll-stagger"
import { FadeScale } from "@/components/patterns/fade-scale"

export const metadata = {
  title: "teepo — כל הלימודים שלך, במקום אחד",
  description:
    "TEEPO מסנכרן את Google Drive, Calendar ו-Moodle לפלטפורמה אחת. בלי לחפש בעשרה אתרים שונים.",
}

export default function LandingPage() {
  return (
    <div dir="rtl" className="min-h-screen bg-[#F5EDD8] text-[#2B1F0F] font-sans">
      <section className="relative min-h-screen flex flex-col px-6 lg:px-16 py-8">
        <header className="flex justify-end mb-12">
          <Logo />
        </header>

        <div className="flex-1 flex flex-col lg:flex-row items-center gap-12 lg:gap-20 max-w-7xl mx-auto w-full">
          <div className="flex-1 flex justify-center order-2 lg:order-1">
            <FadeScale trigger="mount" delay={0.4}>
              <HeroVisual />
            </FadeScale>
          </div>

          <div className="flex-1 text-right order-1 lg:order-2">
            <HeroReveal stagger={0.06} delay={0.05} duration={0.8} distance={16} easing="easeOut">
              <HeroRevealItem>
                <h1 className="text-5xl lg:text-6xl font-bold leading-tight mb-6 text-[#2B1F0F]">
                  כל הלימודים שלך,
                  <br />
                  במקום אחד
                </h1>
              </HeroRevealItem>
              <HeroRevealItem>
                <p className="text-lg lg:text-xl text-[#6B5A47] mb-8 leading-relaxed">
                  TEEPO מסנכרן את Google Drive, Calendar ו-Moodle לפלטפורמה אחת.
                  <br />
                  בלי לחפש בעשרה אתרים שונים.
                </p>
              </HeroRevealItem>
              <HeroRevealItem>
                <Link
                  href="/auth"
                  className="inline-flex items-center gap-3 bg-[#1B6B64] hover:bg-[#155753] text-white px-8 py-4 rounded-xl text-lg font-medium transition-colors shadow-lg"
                >
                  <span>התחבר עם Google</span>
                  <ArrowRight className="w-5 h-5 rotate-180" />
                </Link>
              </HeroRevealItem>
            </HeroReveal>
          </div>
        </div>

        <div className="text-center text-sm text-[#6B5A47] mt-12">
          פתוח לסטודנטים של אונ׳ בן-גוריון ואונ׳ תל-אביב בלבד
        </div>
      </section>

      <section className="px-6 lg:px-16 py-24 bg-[#FAEFD9]">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl lg:text-5xl font-bold text-center mb-16 text-[#2B1F0F]">
            איך זה עובד?
          </h2>

          <ScrollStagger stagger={0.08} duration={0.5} distance={30} threshold={0.2} direction="up" easing="easeOut">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <ScrollStaggerItem>
                <div className="bg-[#F5EDD8] rounded-2xl p-8 text-center h-full">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#1B6B64] text-white font-bold mb-4">1</div>
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#1B6B64]/10 mb-4">
                    <LinkIcon className="w-6 h-6 text-[#1B6B64]" />
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-[#2B1F0F]">התחבר</h3>
                  <p className="text-[#6B5A47] leading-relaxed">חבר את Google Drive, Calendar ו-Moodle בקליק אחד</p>
                </div>
              </ScrollStaggerItem>

              <ScrollStaggerItem>
                <div className="bg-[#F5EDD8] rounded-2xl p-8 text-center h-full">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#1B6B64] text-white font-bold mb-4">2</div>
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#1B6B64]/10 mb-4">
                    <RefreshCw className="w-6 h-6 text-[#1B6B64]" />
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-[#2B1F0F]">סנכרן</h3>
                  <p className="text-[#6B5A47] leading-relaxed">TEEPO מארגן את הקבצים, האירועים, והמשימות שלך אוטומטית</p>
                </div>
              </ScrollStaggerItem>

              <ScrollStaggerItem>
                <div className="bg-[#F5EDD8] rounded-2xl p-8 text-center h-full">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#1B6B64] text-white font-bold mb-4">3</div>
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#1B6B64]/10 mb-4">
                    <Target className="w-6 h-6 text-[#1B6B64]" />
                  </div>
                  <h3 className="text-xl font-bold mb-3 text-[#2B1F0F]">התמקד</h3>
                  <p className="text-[#6B5A47] leading-relaxed">תראה הכל במקום אחד ותתחיל ללמוד חכם יותר</p>
                </div>
              </ScrollStaggerItem>
            </div>
          </ScrollStagger>
        </div>
      </section>

      <section className="px-6 lg:px-16 py-24">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl lg:text-5xl font-bold text-center mb-16 text-[#2B1F0F]">
            מה תקבל עם TEEPO?
          </h2>

          <ScrollStagger stagger={0.08} duration={0.5} distance={30} threshold={0.2} direction="up" easing="easeOut">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ScrollStaggerItem>
                <div className="bg-[#FAEFD9] rounded-2xl p-8 text-right h-full">
                  <div className="flex justify-start mb-4">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#1B6B64]/10">
                      <Brain className="w-6 h-6 text-[#1B6B64]" />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-[#2B1F0F]">Brain</h3>
                  <p className="text-[#6B5A47] leading-relaxed">כל התיקיות שלך מ-Google Drive, מאורגנות חזותית</p>
                </div>
              </ScrollStaggerItem>

              <ScrollStaggerItem>
                <div className="bg-[#FAEFD9] rounded-2xl p-8 text-right h-full">
                  <div className="flex justify-start mb-4">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#1B6B64]/10">
                      <Calendar className="w-6 h-6 text-[#1B6B64]" />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-[#2B1F0F]">לוח זמנים חכם</h3>
                  <p className="text-[#6B5A47] leading-relaxed">סנכרון אוטומטי עם Google Calendar</p>
                </div>
              </ScrollStaggerItem>

              <ScrollStaggerItem>
                <div className="bg-[#FAEFD9] rounded-2xl p-8 text-right h-full">
                  <div className="flex justify-start mb-4">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#1B6B64]/10">
                      <ListTodo className="w-6 h-6 text-[#1B6B64]" />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-[#2B1F0F]">מעקב משימות</h3>
                  <p className="text-[#6B5A47] leading-relaxed">רואה מה דחוף, מה חשוב, בלי לפספס</p>
                </div>
              </ScrollStaggerItem>

              <ScrollStaggerItem>
                <div className="bg-[#FAEFD9] rounded-2xl p-8 text-right h-full">
                  <div className="flex justify-start mb-4">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#1B6B64]/10">
                      <BarChart3 className="w-6 h-6 text-[#1B6B64]" />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-[#2B1F0F]">מעקב ציונים</h3>
                  <p className="text-[#6B5A47] leading-relaxed">לוח בקרה של כל הציונים שלך</p>
                </div>
              </ScrollStaggerItem>
            </div>
          </ScrollStagger>
        </div>
      </section>

      <section className="px-6 lg:px-16 py-24 bg-[#FAEFD9]">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl lg:text-5xl font-bold text-center mb-16 text-[#2B1F0F]">
            זה איך זה נראה
          </h2>
          <FadeScale trigger="scroll" threshold={0.2}>
            <DashboardMockup />
          </FadeScale>
        </div>
      </section>

      <section className="px-6 lg:px-16 py-24">
        <div className="max-w-3xl mx-auto text-center">
          <HeroReveal stagger={0} delay={0} duration={0.8} distance={16} easing="easeOut">
            <HeroRevealItem>
              <h2 className="text-4xl lg:text-5xl font-bold mb-8 text-[#2B1F0F]">
                מוכן להתחיל ללמוד חכם יותר?
              </h2>
            </HeroRevealItem>
          </HeroReveal>
          <Link
            href="/auth"
            className="inline-flex items-center gap-3 bg-[#1B6B64] hover:bg-[#155753] text-white px-8 py-4 rounded-xl text-lg font-medium transition-colors shadow-lg"
          >
            <span>התחבר עם Google</span>
            <ArrowRight className="w-5 h-5 rotate-180" />
          </Link>
          <p className="text-sm text-[#6B5A47] mt-4">חינם, כמה דקות והכל מסודר</p>
        </div>
      </section>

      <footer className="px-6 lg:px-16 py-16 border-t border-[#E5D9B8]">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row justify-between gap-12 mb-12">
            <div className="order-1">
              <Logo />
            </div>

            <div className="flex flex-col sm:flex-row gap-12 order-2">
              <div className="text-right">
                <h4 className="font-bold mb-3 text-[#2B1F0F]">מוצר</h4>
                <ul className="space-y-2 text-[#6B5A47]">
                  <li><Link href="#" className="hover:text-[#1B6B64]">תכונות</Link></li>
                  <li><Link href="#" className="hover:text-[#1B6B64]">איך זה עובד</Link></li>
                  <li><Link href="#" className="hover:text-[#1B6B64]">אוניברסיטאות</Link></li>
                </ul>
              </div>

              <div className="text-right">
                <h4 className="font-bold mb-3 text-[#2B1F0F]">חברה</h4>
                <ul className="space-y-2 text-[#6B5A47]">
                  <li><Link href="#" className="hover:text-[#1B6B64]">על TEEPO</Link></li>
                  <li><Link href="#" className="hover:text-[#1B6B64]">יצירת קשר</Link></li>
                </ul>
              </div>

              <div className="text-right">
                <h4 className="font-bold mb-3 text-[#2B1F0F]">משפטי</h4>
                <ul className="space-y-2 text-[#6B5A47]">
                  <li><Link href="/legal/privacy-policy" className="hover:text-[#1B6B64]">פרטיות</Link></li>
                  <li><Link href="/legal/terms-of-service" className="hover:text-[#1B6B64]">תנאי שימוש</Link></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-[#E5D9B8] text-center text-[#6B5A47] text-sm">
            © 2026 TEEPO — נבנה ע״י סטודנט, בשביל סטודנטים
          </div>
        </div>
      </footer>
    </div>
  )
}
