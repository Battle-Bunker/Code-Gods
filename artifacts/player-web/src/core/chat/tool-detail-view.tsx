/**
 * An expanded tool call in the assistant pane: the sections of tool-detail.ts (what the assistant sent and read, in
 * full) as code with highlighting, prose, fact rows, tables, lists and a key/value tree. Long sections scroll.
 */
import { highlight, toolDetail, type DetailCall, type Section, type TreeNode } from "./tool-detail";

const TOKEN: Record<string, string> = {
  keyword: "text-[hsl(var(--primary))] font-semibold", string: "text-[hsl(var(--accent))]", comment: "text-muted-foreground italic", number: "text-[hsl(var(--primary))]", plain: "",
};
const BOX = "max-h-64 overflow-auto bg-muted p-2";

export function ToolDetail({ call }: { call: DetailCall }) {
  const sections = toolDetail(call);
  return (
    <div className="mt-1 space-y-2 font-sans text-[11px] text-foreground" data-testid="assistant-tool-detail">
      {sections.map((section, i) => <SectionView key={i} section={section} />)}
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>;
}

function SectionView({ section }: { section: Section }) {
  switch (section.kind) {
    case "note": {
      const tone = section.tone === "error" ? "border-destructive text-destructive" : section.tone === "warn" ? "border-[hsl(var(--primary))]" : "border-[hsl(var(--accent))]";
      return <p className={`border-l-2 pl-2 ${tone}`} data-testid={`tool-note-${section.tone}`}>{section.text}</p>;
    }
    case "code":
      return (
        <div data-testid="tool-code">
          <Title>{section.title} · {section.language}</Title>
          <pre className={`${BOX} whitespace-pre font-mono text-[11px] leading-snug`}><code>
            {highlight(section.code, section.language).map((t, i) => <span key={i} className={TOKEN[t.kind]}>{t.text}</span>)}
          </code></pre>
        </div>
      );
    case "text":
      return <div><Title>{section.title}</Title><p className={`${BOX} whitespace-pre-wrap break-words`}>{section.text}</p></div>;
    case "facts":
      return (
        <div><Title>{section.title}</Title>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            {section.rows.map(([k, v]) => [<dt key={`${k}-k`} className="text-muted-foreground">{k}</dt>, <dd key={`${k}-v`} className="break-words">{v}</dd>])}
          </dl>
        </div>
      );
    case "list":
      return <div><Title>{section.title}</Title><ul className="list-disc space-y-0.5 pl-4">{section.items.map((item, i) => <li key={i} className="break-words">{item}</li>)}</ul></div>;
    case "table":
      return <div><Title>{section.title}</Title><TableView columns={section.columns} rows={section.rows} /></div>;
    case "tree":
      return <div><Title>{section.title}</Title><div className="max-h-64 overflow-auto"><TreeView node={section.node} /></div></div>;
  }
}

function TableView({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="max-h-64 overflow-auto">
      <table className="w-full border-collapse text-left">
        <thead><tr>{columns.map(c => <th key={c} className="sticky top-0 bg-card px-1.5 py-0.5 font-semibold text-muted-foreground">{c}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i} className="border-t border-[hsl(var(--card-border))]">{row.map((cell, j) => <td key={j} className="px-1.5 py-0.5 align-top break-words">{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function TreeView({ node }: { node: TreeNode }) {
  switch (node.kind) {
    case "value":
      return node.multiline ? <pre className="whitespace-pre-wrap break-words bg-muted p-1.5 font-mono text-[10px]">{node.text}</pre> : <span className="break-words">{node.text}</span>;
    case "table":
      return <TableView columns={node.columns} rows={node.rows} />;
    case "list":
      return <ol className="list-decimal space-y-0.5 pl-4">{node.items.map((item, i) => <li key={i}><TreeView node={item} /></li>)}</ol>;
    case "map":
      return (
        <dl className="space-y-0.5">
          {node.entries.map(([k, v]) => v.kind === "value" && !v.multiline
            ? <div key={k} className="flex gap-2"><dt className="shrink-0 text-muted-foreground">{k}</dt><dd className="min-w-0"><TreeView node={v} /></dd></div>
            : <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="border-l border-[hsl(var(--card-border))] pl-2"><TreeView node={v} /></dd></div>)}
        </dl>
      );
  }
}
