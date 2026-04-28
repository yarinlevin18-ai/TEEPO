"""BGU-specific selectors for the Moodle scraper.

The Moodle 4.x AJAX API is identical across schools, so most of this
just confirms the standard role shortnames + Hebrew localized role names
that BGU uses. If a future BGU Moodle skin adds new role labels or
syllabus naming conventions, edit them here — not inside the scraper.
"""

BGU_SELECTORS: dict = {
    "code": "bgu",
    "label": "BGU",
    "log_prefix": "[BGU]",

    # Moodle role classification. shortnames are standard across Moodle
    # installs; the Hebrew names are the localized labels BGU shows in the
    # participants UI.
    "lecturer_role_shortnames": ("editingteacher", "coursecreator"),
    "ta_role_shortnames": ("teacher", "ta", "teachingassistant", "tutor"),
    "lecturer_heb_keywords": ("מרצה",),
    "ta_heb_keywords": ("מתרגל", "מתרגלת", "עוזר הוראה", "עוזרת הוראה"),

    # Module-name patterns that flag a resource as the syllabus.
    "syllabus_patterns": (
        "syllabus",
        "סילבוס",
        "תכנית הקורס",
        "תכנית לימודים",
        "תיאור הקורס",
        "תקציר הקורס",
    ),

    # Module types we lift into course_links (excludes file resources —
    # those go into materials).
    "link_module_types": ("url",),

    # Login flow — used by login_headless to detect when SSO finished and
    # we're back on a logged-in page.
    "moodle_login_success_host": "moodle.bgu.ac.il",
    "portal_login_success_host": "my.bgu.ac.il",
}
