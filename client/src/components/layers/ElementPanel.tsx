import { LayersHeader } from "./LayersHeader";
import { DvdControls } from "./DvdControls";
import { SelectedLayerControls } from "./SelectedLayerControls";
import { LayersList } from "./LayersList";
import { type ElementPanelProps } from "./types";
import { useLayersServices } from "./useLayersServices";
import { useLayerSelection } from "./useLayerSelection";
import { useLayerAnimation } from "./useLayerAnimation";
import { useSelectedLayerTools } from "./useSelectedLayerTools";
import { useLayerList } from "./useLayerList";
import type { LayersContext } from "./context";

export function ElementPanel(props: ElementPanelProps) {
  const layersServices = useLayersServices();
  const layerSelection = useLayerSelection(props);
  const layerAnimation = useLayerAnimation(props, { ...layerSelection, ...layersServices });
  const selectedLayerTools = useSelectedLayerTools(props, { ...layerSelection });
  const layerList = useLayerList(props);
  const s: LayersContext = {
    ...layersServices,
    ...layerSelection,
    ...layerAnimation,
    ...selectedLayerTools,
    ...layerList,
  };
  const { elements, footer } = props;
  const { selectedElement, layerSearch, setLayerSearch } = s;

  return (
    <div
      className="layers-panel"
      style={{
        width: "var(--sidebar-width)",
        background: "var(--bg-panel)",
        borderRight: "1px solid var(--line)",
        display: "flex",
        flexDirection: "column",
        overflowX: "hidden",
        // A layer's control cards and the footer can be taller than a short window; scroll
        // rather than clip them out of reach.
        overflowY: "auto",
        flexShrink: 0,
      }}
    >
      <LayersHeader props={props} s={s} />
      {elements.length > 0 && (
        <div className="layers-panel__search">
          <input
            value={layerSearch}
            onChange={(event) => setLayerSearch(event.target.value)}
            placeholder="Search layers…"
            aria-label="Search layers"
          />
        </div>
      )}
      {selectedElement?.dvdEnabled && !selectedElement.locked && (
        <DvdControls props={props} s={s} />
      )}
      {selectedElement && <SelectedLayerControls props={props} s={s} />}
      {!selectedElement && elements.length > 0 && (
        <div className="layer-selection-hint">
          Select a layer to edit opacity, animations, locking, and effects.
        </div>
      )}
      <LayersList props={props} s={s} />
      {footer}
    </div>
  );
}
