import { z } from "zod";
import { BlockDefinition } from "./types";
import { imageTemplateField } from "./fields";
import { templated } from "../flow/dataSchema";

export const imageGenerate: BlockDefinition = {
  type: "action_image_generate",
  id_prefix: "img",
  title: "Generate Image",
  description:
    "Create custom rank cards, welcome banners, and dynamic images for your messages.",
  icon: "image",
  category: "Utilities",
  credits: 10,
  strict_settings: true,
  run: { kind: "custom" },
  fields: [
    imageTemplateField,
    {
      name: "image_variables",
      schema: templated(
        z.string().optional(),
        "Set the text, user details, and stats to display on this image."
      ).optional(),
    },
  ],
  result: {
    schema: z
      .object({
        url: z
          .string()
          .describe(
            "Image link ready to display in embeds, messages, or buttons"
          ),
        attachment: z
          .string()
          .describe(
            "Direct attachment reference for your message"
          ),
        filename: z
          .string()
          .describe("Name of the attached image file"),
        width: z.number().describe("Width of the image in pixels"),
        height: z.number().describe("Height of the image in pixels"),
      })
      .describe("The generated image"),
  },
};
