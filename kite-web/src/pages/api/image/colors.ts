import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const url =
    (req.query.url as string) || (typeof req.body === "object" ? req.body?.url : undefined);

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing or invalid image url" });
  }

  try {
    const apiRes = await fetch("http://127.0.0.1:8080/v1/images/extract-colors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    if (apiRes.ok) {
      const data = await apiRes.json();
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
      return res.status(200).json(data.data || data);
    }

    return res.status(apiRes.status).json({ error: "Failed to extract colors" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}
