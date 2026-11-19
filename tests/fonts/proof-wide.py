# Writes tests/fonts/proof-wide.woff2, the font the browser test embeds: the family "Proof Wide", whose every letter
# is one filled box two em wide, so text set in it is far wider than in any fallback. It is made here, from nothing,
# and is in the public domain (CC0 1.0), as its name table says. Run it from the repository's top folder:
#   uvx --from 'fonttools[woff]==4.55.0' python tests/fonts/proof-wide.py
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

UNITS = 1000
WIDE = 2 * UNITS


def box(width: int) -> object:
    pen = TTGlyphPen(None)
    if width:
        pen.moveTo((50, 0))
        pen.lineTo((50, 700))
        pen.lineTo((width - 50, 700))
        pen.lineTo((width - 50, 0))
        pen.closePath()
    return pen.glyph()


letters = [chr(code) for code in [*range(ord("A"), ord("Z") + 1), *range(ord("a"), ord("z") + 1)]]
builder = FontBuilder(UNITS, isTTF=True)
builder.setupGlyphOrder([".notdef", "space", "box"])
builder.setupCharacterMap({0x20: "space", **{ord(letter): "box" for letter in letters}})
builder.setupGlyf({".notdef": box(500), "space": box(0), "box": box(WIDE)})
builder.setupHorizontalMetrics({".notdef": (500, 50), "space": (250, 0), "box": (WIDE, 50)})
builder.setupHorizontalHeader(ascent=800, descent=-200)
builder.setupNameTable(
    {
        "familyName": "Proof Wide",
        "styleName": "Regular",
        "licenseDescription": "CC0 1.0: made for open-prototype's tests, and in the public domain.",
        "licenseInfoURL": "https://creativecommons.org/publicdomain/zero/1.0/",
    }
)
builder.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
builder.setupPost()
builder.font.flavor = "woff2"
builder.save("tests/fonts/proof-wide.woff2")
