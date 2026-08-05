import { useEffect, useRef } from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Layers,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clearAll } from "../store/undoable";
import { currentPageKey } from "../utils/normalizeUrl";
import { exportAndDownload } from "../utils/exportAnnotations";
import { importJsonl, importReadwiseCsv, importKindleClippings, importHypothesisJson } from "../utils/importers";
import { tools } from "../tools/registry";
import PresenceIndicator from "./PresenceIndicator";
import AuthButton from "./AuthButton";
import type { UndoAction } from "../hooks/useUndoRedo";
import { viewportBottomCenter, useProximityDim } from "../utils/synchrony";

interface Props {
  activeToolId: string | null;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSelectTool: (tool: string | null) => void;
  onClose: () => void;
  onUndoableAction?: (action: UndoAction) => void;
  onSearchOpen?: () => void;
}

export default function CommandPalette({
  activeToolId,
  expanded,
  onExpandedChange,
  onSelectTool,
  onClose,
  onUndoableAction,
  onSearchOpen,
}: Props) {
  const paletteRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const activeTool = tools.find((tool) => tool.id === activeToolId);
  const ActiveToolIcon = activeTool?.icon;

  // The compact launcher remains discoverable without becoming another
  // permanently opaque obstruction. The expanded palette stays fully visible;
  // only the collapsed launcher dims when the pointer is far away.
  useProximityDim(paletteRef, {
    nearPx: 64,
    farPx: 260,
    idleOpacity: expanded ? 1 : 0.32,
  });

  // The full palette is transient UI. A click anywhere outside its shadow-
  // DOM subtree collapses it, while the annotation overlay and selected tool
  // stay active. `composedPath()` is required because this component lives in
  // a shadow root and a plain `contains(e.target)` check cannot cross it.
  useEffect(() => {
    if (!expanded) return;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const palette = paletteRef.current;
      const path = event.composedPath();
      if (!palette || path.includes(palette)) return;
      if (path.some((node) => node instanceof Element && node.hasAttribute('data-annotator-toolbar-surface'))) return;
      onExpandedChange(false);
    };

    window.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () => window.removeEventListener('pointerdown', handleOutsidePointerDown, true);
  }, [expanded, onExpandedChange]);

  const currentUrl = currentPageKey();

  const handleExportAll = async () => {
    try {
      await exportAndDownload();
    } catch (e) {
      console.error("Failed to export annotations", e);
    }
  };

  const handleExportPage = async () => {
    try {
      await exportAndDownload({ url: currentUrl });
    } catch (e) {
      console.error("Failed to export page annotations", e);
    }
  };

  /**
   * Route an imported file to the right parser. We sniff format in this
   * order: extension first (cheap, unambiguous for .csv / .jsonl); for
   * `.txt` we trust Kindle's `==========` separator; for `.json` we peek
   * at the first row to distinguish Hypothesis (`uri`/`target`) from our
   * own JSONL fallback.
   */
  const handleImportFile = async (file: File) => {
    try {
      const content = await file.text();
      const name = file.name.toLowerCase();

      let result: { imported: number; skipped?: number };
      if (name.endsWith('.csv')) {
        result = await importReadwiseCsv(content);
      } else if (name.endsWith('.jsonl')) {
        result = await importJsonl(content);
      } else if (name.endsWith('.txt')) {
        result = await importKindleClippings(content);
      } else if (name.endsWith('.json')) {
        result = await importHypothesisJson(content);
      } else {
        // Unknown extension — try JSONL (our own format), then fall back.
        try { result = await importJsonl(content); }
        catch { result = await importHypothesisJson(content); }
      }

      const skipped = result.skipped ? ` (${result.skipped} skipped)` : '';
      window.alert(`Imported ${result.imported} annotations${skipped}.`);
    } catch (e) {
      console.error('Import failed', e);
      window.alert(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleClearAll = async () => {
    if (window.confirm("Clear all annotations on this page?")) {
      try {
        const action = await clearAll(currentUrl);
        onUndoableAction?.(action);
        onSelectTool('pointer');
        onClose();
      } catch (e) {
        console.error("Failed to clear annotations", e);
      }
    }
  };

  return (
    <div
      ref={paletteRef}
      data-annotator-toolbar-surface=""
      style={{
        ...viewportBottomCenter(20),
        zIndex: 9999,
        pointerEvents: 'auto',
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {expanded ? (
          <motion.div
            key="expanded"
            drag
            dragMomentum={false}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}
            className="flex items-center p-2 gap-2 bg-white/90 backdrop-blur-xl border border-white/30 shadow-2xl rounded-full text-slate-800"
            style={{ cursor: 'default' }}
            role="toolbar"
            aria-label="Annotation tools"
          >
            <div className="flex items-center gap-1 pr-4 border-r border-slate-200/50 cursor-grab active:cursor-grabbing">
              {tools.map((t) => {
                const Icon = t.icon;
                const isActive = activeToolId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelectTool(isActive ? null : t.id)}
                    className={`p-3 rounded-full transition-all duration-200 ${
                      isActive
                        ? "bg-blue-500 text-white shadow-md scale-105"
                        : "hover:bg-slate-100/70 text-slate-600 hover:text-slate-900 hover:scale-105"
                    }`}
                    title={`${t.label} (${t.hotkey})`}
                    aria-pressed={isActive}
                  >
                    <Icon size={20} className={isActive ? "stroke-[2.5px]" : "stroke-2"} />
                  </button>
                );
              })}
            </div>

            <PresenceIndicator />

            <div className="flex items-center gap-1 pl-2">
              <button
                type="button"
                onClick={() => onSearchOpen?.()}
                className="p-3 rounded-full text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 transition-all duration-200 hover:scale-105"
                title="Search Annotations"
              >
                <Search size={20} className="stroke-2" />
              </button>
              <button
                type="button"
                onClick={() => {
                  chrome.runtime.sendMessage({ type: "OPEN_FEED" });
                  onExpandedChange(false);
                }}
                className="p-3 rounded-full text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 transition-all duration-200 hover:scale-105"
                title="All Annotations"
              >
                <Layers size={20} className="stroke-2" />
              </button>
              <button
                type="button"
                onClick={handleExportAll}
                onContextMenu={(e) => { e.preventDefault(); handleExportPage(); }}
                className="p-3 rounded-full text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 transition-all duration-200 hover:scale-105"
                title="Export All (right-click for this page only)"
              >
                <Download size={20} className="stroke-2" />
              </button>
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                className="p-3 rounded-full text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 transition-all duration-200 hover:scale-105"
                title="Import (Readwise .csv, Kindle My Clippings .txt, Hypothesis .json, JSONL backup)"
              >
                <Upload size={20} className="stroke-2" />
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,.txt,.json,.jsonl"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFile(file);
                  e.target.value = ''; // allow re-importing the same file
                }}
              />
              <button
                type="button"
                onClick={handleClearAll}
                className="p-3 rounded-full text-red-500 hover:bg-red-50 hover:text-red-600 transition-all duration-200 hover:scale-105"
                title="Clear All"
              >
                <Trash2 size={20} />
              </button>
              <AuthButton />
              <div className="w-px h-7 bg-slate-200/70 mx-1" />
              <button
                type="button"
                onClick={() => onExpandedChange(false)}
                className="p-3 rounded-full text-slate-500 hover:bg-slate-100/70 hover:text-slate-900 transition-all duration-200"
                title="Collapse toolbar"
                aria-label="Collapse annotation toolbar"
              >
                <ChevronDown size={20} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-3 rounded-full text-slate-500 hover:bg-slate-100/70 hover:text-red-600 transition-all duration-200"
                title="Close annotator (`)"
                aria-label="Close annotator"
              >
                <X size={20} />
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="collapsed"
            type="button"
            initial={{ opacity: 0, y: 12, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.92 }}
            transition={{ type: "spring", bounce: 0.2, duration: 0.3 }}
            onClick={() => onExpandedChange(true)}
            className="flex items-center gap-2 px-3 py-2 bg-white/90 backdrop-blur-xl border border-white/30 shadow-lg rounded-full text-slate-700 hover:text-slate-950 hover:shadow-xl transition-shadow"
            title="Open annotation tools (`)"
            aria-label={activeTool ? `Open annotation tools. Active tool: ${activeTool.label}` : 'Open annotation tools'}
            aria-expanded={false}
          >
            {ActiveToolIcon ? (
              <ActiveToolIcon size={17} className="stroke-[2.25px]" />
            ) : (
              <ChevronUp size={17} className="stroke-2" />
            )}
            <span className="text-xs font-semibold leading-none">
              {activeTool?.label ?? 'Tools'}
            </span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100/90 text-[10px] font-mono text-slate-500 leading-none">
              {activeTool?.hotkey ?? '`'}
            </kbd>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
