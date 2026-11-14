---
sidebar_position: 37.3
---

import EmbedFlowNode from "../../../../src/components/EmbedFlowNode";
import NodeInfoExplorer from "../../../../src/components/NodeInfoExplorer";

# Generate Image

<EmbedFlowNode type="action_image_generate" />

The `Generate Image` block renders dynamic images using templates created with Kite's built-in **Image Template Editor**. It natively generates customized cards, welcome banners, level badges, and leaderboards without requiring third-party integrations.

### Setup and Usage

1. Open **Image Templates** in your Kite App Studio sidebar and create or customize a template (such as a Level Card, Welcome Banner, or Leaderboard).
2. Add the **Generate Image** block to your flow.
3. Select your template in the **Image Template** dropdown.
4. Pass dynamic variables in the **Variables** field (as JSON or template expressions like `{"name": "{{ event.user.username }}", "xp": 450}`).

### Result

The block returns an object containing:
- `url`: A high-resolution Data URL of the generated image suitable for embed images, thumbnail attachments, and webhook payloads (`{{ result('img').url }}`).
- `svg`: The raw SVG markup of the generated graphic.
- `width`: Image width in pixels.
- `height`: Image height in pixels.

<NodeInfoExplorer type="action_image_generate" />
