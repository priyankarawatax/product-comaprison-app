import type { ActionFunctionArgs } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";

const MAX_TITLE_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 5000;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!title || !description) {
    return Response.json(
      { ok: false, error: "Title and description are required." },
      { status: 400 },
    );
  }

  if (title.length > MAX_TITLE_LENGTH) {
    return Response.json(
      { ok: false, error: `Title must be ${MAX_TITLE_LENGTH} characters or fewer.` },
      { status: 400 },
    );
  }

  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return Response.json(
      { ok: false, error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.` },
      { status: 400 },
    );
  }

  try {
    await db.$executeRaw`
      INSERT INTO feature_requests (shop, title, description, createdAt)
      VALUES (${session.shop}, ${title}, ${description}, CURRENT_TIMESTAMP(3))
    `;
  } catch (error) {
    console.error("Failed to save feature request", error);
    return Response.json(
      { ok: false, error: "Could not send your request. Please try again." },
      { status: 500 },
    );
  }

  return Response.json({ ok: true });
};
