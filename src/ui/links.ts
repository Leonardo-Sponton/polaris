import { createContext } from "react";
import type { WikiLinks } from "../editor/wikiLinks";

// The app's [[links]]: every editor uses them unless its screen gives its own (Study). Set by the
// Shell, which knows every note, idea, project, book and study note by title.

export const LinksCtx = createContext<WikiLinks | undefined>(undefined);
