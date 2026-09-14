// CoreText probe: every available font family, with its monospace trait.
//
// Used by `app/api/fonts/route.ts` on macOS, where `atsutil fonts -list` gives family names fast but no
// classification, and `system_profiler SPFontsDataType` gives neither spacing nor a usable runtime.
// CoreText's `kCTFontMonoSpaceTrait` is the trustworthy source (it knows Monaco, which fontconfig misses).
//
// Compiled and run per request by `swift` (~0.4 s); the route caches the result for an hour.
// Output: `[{"family":"Menlo","mono":true}, …]` on stdout, one entry per family.

import CoreText
import Foundation

let collection = CTFontCollectionCreateFromAvailableFonts(nil)
let descriptors = (CTFontCollectionCreateMatchingFontDescriptors(collection) as? [CTFontDescriptor]) ?? []

var seen = Set<String>()
var families: [[String: Any]] = []

for descriptor in descriptors {
    guard let family = CTFontDescriptorCopyAttribute(descriptor, kCTFontFamilyNameAttribute) as? String else { continue }
    let name = family.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty, !seen.contains(name) else { continue }
    seen.insert(name)

    let font = CTFontCreateWithFontDescriptor(descriptor, 12, nil)
    let mono = CTFontGetSymbolicTraits(font).contains(.traitMonoSpace)
    families.append(["family": name, "mono": mono])
}

let data = try JSONSerialization.data(withJSONObject: families, options: [])
FileHandle.standardOutput.write(data)
