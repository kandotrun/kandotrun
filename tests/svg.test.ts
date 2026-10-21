import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { attrs, dataUri, esc, svgDoc } from "../src/render/svg";

describe("esc", () => {
  it("escapes XML special characters", () => {
    expect(esc(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;");
  });
});

describe("attrs", () => {
  it("serializes attributes and skips undefined, null and false", () => {
    expect(attrs({ x: 1, fill: "#fff", hidden: false, y: undefined, z: null })).toBe(` x="1" fill="#fff"`);
  });

  it("escapes attribute values", () => {
    expect(attrs({ title: `a"b` })).toBe(` title="a&quot;b"`);
  });
});

describe("svgDoc", () => {
  const doc = svgDoc({
    width: 400,
    height: 200,
    title: "Kan & co",
    desc: "A test <svg>",
    style: ".a{fill:red}",
    body: `<rect class="a" width="10" height="10"/>`,
  });

  it("is well-formed XML", () => {
    expect(XMLValidator.validate(doc)).toBe(true);
  });

  it("is an accessible image with title and desc", () => {
    expect(doc).toContain(`role="img"`);
    expect(doc).toContain("<title");
    expect(doc).toContain("Kan &amp; co");
    expect(doc).toContain("A test &lt;svg&gt;");
  });

  it("declares the SVG namespace and viewBox", () => {
    expect(doc).toContain(`xmlns="http://www.w3.org/2000/svg"`);
    expect(doc).toContain(`viewBox="0 0 400 200"`);
  });
});

describe("dataUri", () => {
  it("base64-encodes bytes with the given MIME type", () => {
    expect(dataUri("text/plain", Buffer.from("hi"))).toBe("data:text/plain;base64,aGk=");
  });
});
