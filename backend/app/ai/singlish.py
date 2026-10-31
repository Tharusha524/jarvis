"""Turns Singlish into Sinhala script, so the translator can read it.

Common words come from a list, because Singlish spelling hides long vowels and
similar letters. Other words are converted sound by sound. Words that are
clearly not Sinhala, such as app names, stay as they are.
"""

import re

COMMON_WORDS = {
    "aei": "ඇයි", "ai": "ඇයි", "ada": "අද", "adha": "අද", "aliya": "අලියා", "aliyage": "අලියාගේ", "ali": "අලි",
    "amma": "අම්මා", "badaginii": "බඩගිනියි", "bada": "බඩ", "gini": "ගිනි", "ginii": "ගිනියි", "sigiriya": "සීගිරිය",
    "mahanuwara": "මහනුවර", "galle": "ගාල්ල", "jaffna": "යාපනය", "anuradhapura": "අනුරාධපුරය", "api": "අපි", "apita": "අපිට", "asiyanu": "ආසියානු", "asiyawe": "ආසියාවේ", "ayubowan": "ආයුබෝවන්",
    "balanna": "බලන්න", "bari": "බැරි","bohoma": "බොහොම", "dan": "දැන්", "dannawa": "දන්නවා",
    "dawasa": "දවස", "dena": "දෙන", "denna": "දෙන්න", "dewal": "දේවල්", "digama": "දිගම", "dige": "දිගේ", "eka": "එක",
    "ekak": "එකක්", "ekata": "එකට", "eke": "එකේ", "ekka": "එක්ක", "enawa": "එනවා", "enna": "එන්න", "epa": "එපා",
    "gana": "ගැන", "ganga": "ගඟ", "gedara": "ගෙදර", "giya": "ගියා", "godak": "ගොඩක්", "hadanna": "හදන්න", "hari": "හරි",
    "hariyata": "හරියට", "heta": "හෙට", "hodai": "හොඳයි", "honda": "හොඳ", "hondai": "හොඳයි", "hoyanna": "හොයන්න",
    "iskole": "ඉස්කෝලේ", "iye": "ඊයේ", "inna": "ඉන්න", "innawa": "ඉන්නවා", "kalaguna": "කාලගුණය", "kalagunaya": "කාලගුණය",
    "kalin": "කලින්", "kama": "කෑම", "karala": "කරලා", "karanawa": "කරනවා", "karanna": "කරන්න", "karanne": "කරන්නේ",
    "karapan": "කරපන්", "kawda": "කවුද", "kawadada": "කවදාද", "keeyada": "කීයද", "kiyada": "කීයද", "kiyala": "කියලා",
    "kiyanawa": "කියනවා", "kiyanna": "කියන්න", "kiyanne": "කියන්නේ", "kiyapan": "කියපන්", "kohe": "කොහේ", "koheda": "කොහෙද",
    "kohomada": "කොහොමද", "kothanada": "කොතනද", "lamayi": "ළමයි", "lanka": "ලංකා", "lankawe": "ලංකාවේ", "lankawa": "ලංකාව",
    "lassana": "ලස්සන", "mage": "මගේ", "magen": "මගෙන්", "mama": "මම", "mata": "මට", "mokada": "මොකද", "mokadda": "මොකද්ද",
    "mokakda": "මොකක්ද", "monawada": "මොනවද", "nama": "නම", "naha": "නැහැ", "nehe": "නැහැ", "neda": "නේද", "nedda": "නේද",
    "nisa": "නිසා", "oya": "ඔයා", "oyage": "ඔයාගේ", "oyata": "ඔයාට", "ow": "ඔව්", "passe": "පස්සේ", "podi": "පොඩි",
    "puluwan": "පුළුවන්", "puluwanda": "පුළුවන්ද", "salli": "සල්ලි", "sthuthi": "ස්තූතියි", "thaththa": "තාත්තා",
    "thiyanawa": "තියෙනවා", "thiyenawa": "තියෙනවා", "thiyenne": "තියෙන්නේ", "tika": "ටික", "tikak": "ටිකක්", "tikk": "ටිකක්",
    "tikek": "ටිකක්", "wada": "වැඩ", "wage": "වගේ", "wela": "වෙලා", "welawa": "වෙලාව", "wisthara": "විස්තර",
    "wisthare": "විස්තරේ", "yanawa": "යනවා", "yanna": "යන්න", "yaluwa": "යාළුවා",
}

# Spoken to the assistant, so it adds nothing to the meaning.
IGNORED_WORDS = {"jarvis"}

# Written the same in Singlish and English, and best left for the translator.
KEPT_WORDS = {
    "app", "apps", "bluetooth", "browser", "chrome", "close", "code", "colombo", "computer", "email", "explorer",
    "file", "files", "folder", "google", "internet", "kandy", "laptop", "learning", "machine", "notepad", "off", "on",
    "open", "phone", "python", "search", "sir", "studio", "update", "visual", "vs", "wifi", "youtube",
}

CONSONANTS = (
    ("ndh", "ඳ"), ("mb", "ඹ"), ("ng", "ඟ"), ("kh", "ඛ"), ("gh", "ඝ"), ("chh", "ඡ"), ("ch", "ච"), ("sh", "ශ"), ("th", "ත"),
    ("dh", "ද"), ("ph", "ඵ"), ("bh", "භ"), ("k", "ක"), ("g", "ග"), ("c", "ක"), ("j", "ජ"), ("t", "ට"), ("d", "ද"), ("n", "න"),
    ("p", "ප"), ("b", "බ"), ("m", "ම"), ("y", "ය"), ("r", "ර"), ("l", "ල"), ("w", "ව"), ("v", "ව"), ("s", "ස"), ("h", "හ"),
    ("f", "ෆ"), ("q", "ක"), ("x", "ක්ස"), ("z", "ස"),
)
VOWELS = (
    ("aa", "ආ", "ා"), ("ae", "ඇ", "ැ"), ("ii", "ඊ", "ී"), ("ee", "ඒ", "ේ"), ("uu", "ඌ", "ූ"), ("oo", "ඕ", "ෝ"),
    ("a", "අ", ""), ("i", "ඉ", "ි"), ("u", "උ", "ු"), ("e", "එ", "ෙ"), ("o", "ඔ", "ො"),
)
VIRAMA = "්"
WORD = re.compile(r"[A-Za-z]+")


def _match(text: str, position: int, table: tuple) -> tuple | None:
    return next((entry for entry in table if text.startswith(entry[0], position)), None)


def convert_word(word: str) -> str:
    """Converts one word sound by sound."""
    output = []
    position = 0
    while position < len(word):
        consonant = _match(word, position, CONSONANTS)
        if consonant:
            position += len(consonant[0])
            vowel = _match(word, position, VOWELS)
            if vowel:
                position += len(vowel[0])
                output.append(consonant[1] + vowel[2])
            else:
                output.append(consonant[1] + VIRAMA)
            continue
        vowel = _match(word, position, VOWELS)
        if vowel:
            position += len(vowel[0])
            output.append(vowel[1])
        else:
            position += 1
    return "".join(output)


def singlish_to_sinhala(text: str) -> str:
    def replace(match: re.Match) -> str:
        original = match.group()
        word = original.lower()
        if word in IGNORED_WORDS:
            return ""
        if word in COMMON_WORDS:
            return COMMON_WORDS[word]
        if word in KEPT_WORDS or (len(word) > 1 and original.isupper()):
            return original
        return convert_word(word)

    converted = WORD.sub(replace, text)
    return re.sub(r"\s+([,.?!])", r"\1", re.sub(r"\s+", " ", converted)).strip(" ,")
