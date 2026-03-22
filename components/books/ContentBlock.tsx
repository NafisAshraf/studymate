"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

interface ContentBlockProps {
  html: string;
  blockType: string;
}

/**
 * Converts Datalab HTML to renderable markdown/LaTeX.
 * - Strips outer wrapper tags (e.g. <p>...</p>, <div>...</div>)
 * - Converts <math display="block">...</math> to $$ ... $$ (display math)
 * - Converts <math>...</math> to $ ... $ (inline math)
 * - Converts <img> tags to markdown image syntax
 */
function convertHtmlToMarkdown(html: string): string {
  let content = html.trim();

  // Strip outer wrapper tag if present
  const outerTagMatch = content.match(
    /^<(\w+)(?:\s[^>]*)?>([\s\S]*)<\/\1>$/
  );
  if (outerTagMatch) {
    content = outerTagMatch[2].trim();
  }

  // Convert display math: <math display="block">...</math> -> $$ ... $$
  content = content.replace(
    /<math\s+display=["']block["'][^>]*>([\s\S]*?)<\/math>/gi,
    (_match, inner) => `\n$$\n${inner.trim()}\n$$\n`
  );

  // Convert inline math: <math>...</math> -> $ ... $
  content = content.replace(
    /<math(?:\s[^>]*)?>([\s\S]*?)<\/math>/gi,
    (_match, inner) => `$${inner.trim()}$`
  );

  // Convert <img> tags to markdown images
  content = content.replace(
    /<img\s+[^>]*src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*?)["'])?[^>]*\/?>/gi,
    (_match, src, alt) => `![${alt || ""}](${src})`
  );

  // Convert <br> / <br/> to newlines
  content = content.replace(/<br\s*\/?>/gi, "\n");

  return content;
}

export function ContentBlock({ html, blockType }: ContentBlockProps) {
  // For figures/pictures, try to extract and render the image directly
  if (blockType === "Figure" || blockType === "Picture") {
    const srcMatch = html.match(/src=["']([^"']+)["']/);
    const altMatch = html.match(/alt=["']([^"']*?)["']/);
    if (srcMatch) {
      return (
        <div className="my-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={srcMatch[1]}
            alt={altMatch?.[1] || "Figure"}
            className="max-w-full rounded-lg"
          />
        </div>
      );
    }
  }

  const markdown = convertHtmlToMarkdown(html);

  return (
    <div className="prose-studymate">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
