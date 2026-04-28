"""TAU-specific selectors for the Moodle scraper.

Most fields mirror BGU because Moodle 4.x role shortnames + Hebrew
labels are the same across Israeli universities. The fields that
genuinely differ — syllabus naming conventions, login success host —
are the reason this lives separately.

The values below are a working baseline; someone with a real TAU
account should run a sync and adjust the syllabus_patterns / role
labels if Moodle is showing something we missed.
"""

TAU_SELECTORS: dict = {
    "code": "tau",
    "label": "TAU",
    "log_prefix": "[TAU]",

    "lecturer_role_shortnames": ("editingteacher", "coursecreator"),
    "ta_role_shortnames": ("teacher", "ta", "teachingassistant", "tutor"),
    "lecturer_heb_keywords": ("מרצה",),
    "ta_heb_keywords": ("מתרגל", "מתרגלת", "עוזר הוראה", "עוזרת הוראה"),

    # TAU includes "סילבוס הקורס" + the BGU set; superset is safest.
    "syllabus_patterns": (
        "syllabus",
        "סילבוס",
        "סילבוס הקורס",
        "תכנית הקורס",
        "תכנית לימודים",
        "תיאור הקורס",
        "תקציר הקורס",
    ),

    "link_module_types": ("url",),

    # TAU's main Moodle is at moodle.tau.ac.il and the registration / portal
    # is on www.ims.tau.ac.il. login_headless redirects through SSO; the
    # success host is what we expect to land on once SSO finishes.
    "moodle_login_success_host": "moodle.tau.ac.il",
    "portal_login_success_host": "www.ims.tau.ac.il",
}
