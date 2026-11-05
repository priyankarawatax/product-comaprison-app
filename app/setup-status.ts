type Extension = {
  type: string;
  activations: Array<{ handle?: string; target: string; status?: string }>;
};

// Only this app's configured blocks count. An unrelated app block must not
// accidentally complete the comparison setup when more blocks are added later.
export function getSetupStatus(
  extensions: Extension[],
  handles: { embed: string; comparison: string },
): [boolean, boolean] {
  const blocks = extensions
    .filter((extension) => extension.type === "theme_app_extension")
    .flatMap((extension) => extension.activations);
  return [
    blocks.some(
      (block) =>
        block.handle === handles.embed &&
        ["head", "body", "compliance_head"].includes(block.target) &&
        block.status === "active",
    ),
    blocks.some(
      (block) =>
        block.handle === handles.comparison &&
        block.target === "section" &&
        block.status === "active",
    ),
  ];
}
