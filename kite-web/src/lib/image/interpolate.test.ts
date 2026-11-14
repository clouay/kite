import { describe, it, expect, beforeEach } from "vitest";
import { resolveValue, interpolateTemplate } from "./interpolate";
import { photoColorCache } from "./photoColors";

describe("interpolate & dynamic photo color resolution", () => {
  beforeEach(() => {
    // Populate cache with known test colors
    (photoColorCache as Map<string, any>).set("https://example.com/logo.png", {
      dominant: "#f26522",
      average: "#e65100",
      inverse: "#00aef0",
      dominantInverse: "#00aef0",
      palette: ["#f26522", "#e65100"],
    });
    (photoColorCache as Map<string, any>).set("https://example.com/avatar.jpg", {
      dominant: "#b88a64",
      average: "#967253",
      inverse: "#6a93b8",
      dominantInverse: "#6a93b8",
      palette: ["#b88a64", "#967253"],
    });
  });

  const layers = [
    {
      id: "layer-bg",
      type: "background",
      name: "Background",
      gradient: {
        angle: 90,
        stops: [
          { color: "#000000", offset: 0 },
          { color: "{{image_avatar_2.dominant}}", offset: 100 },
        ],
      },
    },
    {
      id: "layer-1",
      type: "image",
      name: "Image / Avatar",
      image_url: "{{image_avatar}}",
    },
    {
      id: "layer-2",
      type: "image",
      name: "Image / Avatar",
      image_url: "https://example.com/avatar.jpg",
    },
  ];

  const context = {
    username: "Kite",
    image_avatar: "https://example.com/logo.png",
    _layers: layers,
  };

  it("resolves the first image layer's dominant color", () => {
    const res = resolveValue("{{image_avatar.dominant}}", context);
    expect(res).toBe("#f26522");
  });

  it("resolves the second image layer's dominant color via disambiguated slug (image_avatar_2)", () => {
    const res = resolveValue("{{image_avatar_2.dominant}}", context);
    expect(res).toBe("#b88a64");
  });

  it("resolves the second image layer's inverse color via disambiguated slug", () => {
    const res = resolveValue("{{image_avatar_2.inverse}}", context);
    expect(res).toBe("#6a93b8");
  });

  it("resolves the second image layer by layer ID", () => {
    const res = resolveValue("{{layer-2.dominant}}", context);
    expect(res).toBe("#b88a64");
  });

  it("resolves the second image layer by image index", () => {
    const res = resolveValue("{{image_2.dominant}}", context);
    expect(res).toBe("#b88a64");
  });

  it("interpolates full gradient strings with dynamic tokens", () => {
    const templateStr = "linear-gradient(90deg, #000000 0%, {{image_avatar_2.dominant}} 100%)";
    const interpolated = interpolateTemplate(templateStr, context);
    expect(interpolated).toBe("linear-gradient(90deg, #000000 0%, #b88a64 100%)");
  });
});
