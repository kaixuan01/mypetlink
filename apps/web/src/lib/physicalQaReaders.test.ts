import { describe, expect, it } from "vitest";
import { codesFromManifest, manifestFileProblem, nfcUrlFromRecords, tagCodeFromQr } from "./physicalQaReaders";

const view = (text: string) => new DataView(new TextEncoder().encode(text).buffer);

describe("physical QA decoding", () => {
  it("extracts codes independently of origin validation without navigating", () => {
    expect(tagCodeFromQr("https://unexpected.example/q/MPL-ABCD-2345")).toBe("MPL-ABCD-2345");
    expect(tagCodeFromQr("https://mypetlink.com.my/q/MPL-E8FN-NLGY")).toBe("MPL-E8FN-NLGY");
    expect(tagCodeFromQr("MPL-ABCD-2345")).toBeNull();
    expect(tagCodeFromQr("https://mypetlink.example/q/unknown")).toBeNull();
  });
  it("decodes a genuine NDEF URL record and rejects text or ambiguous records", () => {
    const data = view("https://mypetlink.example/n/MPL-ABCD-2345");
    expect(nfcUrlFromRecords([{ recordType: "url", data }])).toContain("/n/MPL-ABCD-2345");
    // An extra non-link record (for example an app record) does not hide the link.
    expect(nfcUrlFromRecords([{ recordType: "url", data }, { recordType: "android.com:pkg", data: view("x") }])).toContain("/n/MPL-ABCD-2345");
    expect(() => nfcUrlFromRecords([{ recordType: "text", data }])).toThrow(/a text record instead of a standard web link/);
    expect(() => nfcUrlFromRecords([{ recordType: "url", data }, { recordType: "url", data }])).toThrow(/contains 2 web links/);
    expect(() => nfcUrlFromRecords([])).toThrow(/chip is empty/);
  });
  it("names supplier encodings that are not a standard web link record", () => {
    expect(() => nfcUrlFromRecords([{ recordType: "absolute-url", data: view("https://x") }])).toThrow(/absolute address \(URI\) record/);
    expect(() => nfcUrlFromRecords([{ recordType: "smart-poster", data: view("x") }])).toThrow(/smart poster record/);
    expect(() => nfcUrlFromRecords([{ recordType: "url" }])).toThrow(/could not be read/);
    expect(() => nfcUrlFromRecords([{ recordType: "url", data: new DataView(new Uint8Array([0xff, 0xfe, 0xfd]).buffer) }])).toThrow(/not readable text/);
  });
  it("reads the CSV code column without counting codes in QR and NFC URLs", () => {
    const csv = '﻿Tag Code,QR URL,NFC URL,Remarks\r\nMPL-ABCD-2345,https://x/q/MPL-ABCD-2345,https://x/n/MPL-ABCD-2345,"Good, \"\"clean\"\""\r\nMPL-ABCD-2345,,,duplicate';
    expect(codesFromManifest(csv)).toEqual(["MPL-ABCD-2345", "MPL-ABCD-2345"]);
    expect(codesFromManifest("MPL-ABCD-2345\nMPL-AAAA-AAAA")).toHaveLength(2);
    expect(() => codesFromManifest('Tag Code,QR\n"unfinished')).toThrow();
    expect(() => codesFromManifest("Code,Other\nA,B")).toThrow();
  });
  it("reads the manufacturer export once saved as CSV, and explains the Excel file", () => {
    const exported = "Sequence No.,Tag Code,Tag Type,Tag Variant,QR Content,NFC Content,Batch No.\r\n1,MPL-E8FN-NLGY,QR + NFC Smart Tag,Standard,https://mypetlink.com.my/q/MPL-E8FN-NLGY,https://mypetlink.com.my/n/MPL-E8FN-NLGY,B-1\r\n";
    expect(codesFromManifest(exported)).toEqual(["MPL-E8FN-NLGY"]);
    expect(manifestFileProblem("Tag Production.xlsx")).toMatch(/Save As → CSV UTF-8/);
    expect(manifestFileProblem("manifest.csv")).toBeNull();
  });
});
