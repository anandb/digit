export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

// Base interface for elements that can have notes
export interface HasNotes {
  notes: string;
}

// Base class for all diagram elements
export interface DiagramElement extends HasNotes {
  id: string;
  label: string;
  position: Position;
  size: Size;
  attributes: { [key: string]: any };
  tendrils: Tendril[];
}

export interface Tendril extends HasNotes {
  id: string;
  name: string;
  position: Position; // relative to node
  type: 'incoming' | 'outgoing';
  exposed: boolean;
  attributes: { [key: string]: any };
  borderColor: string;
  borderThickness: number;
}

export type NodeShape = 'rectangle' | 'circle' | 'pill' | 'cylinder' | 'diamond' | 'parallelogram' | 'document' | 'roundedRectangle' | 'hexagon' | 'triangle' | 'trapezoid' | 'text' | 'stickman' | 'callout' | 'process' | 'tape' | 'cube';

export interface Node extends DiagramElement {
  shape: NodeShape;
  borderColor: string;
  fillColor: string;
  innerDiagram?: Diagram;
}

export interface Edge extends HasNotes {
  id: string;
  fromNodeId: string;
  fromTendrilId: string;
  toNodeId: string;
  toTendrilId: string;
  name?: string;
  attributes: { [key: string]: any };
}

export interface BoundingBox extends DiagramElement {
  fillColor: string;
  borderColor: string;
  rounded: boolean;
}

export interface SvgImage extends DiagramElement {
  svgContent: string;
  fileName: string;
}

export interface Diagram {
  id: string;
  name: string;
  elements: DiagramElement[];
  edges: Edge[];
  boundingBoxes: BoundingBox[];
  attributes: { [key: string]: any };
}

// Type guards
export function isNode(element: DiagramElement): element is Node {
  return 'shape' in element && 'fillColor' in element;
}

export function isSvgImage(element: DiagramElement): element is SvgImage {
  return 'svgContent' in element && 'fileName' in element;
}

export interface DiagramState {
  currentDiagram: Diagram;
  diagramStack: Diagram[]; // for navigation history
  selectedNodeIds: string[]; // Support multiple selections
  selectedTendrilId?: string;
  selectedBoundingBoxIds: string[]; // Support multiple selections
  selectedSvgImageIds: string[]; // Support multiple selections
  selectedEdgeIds: string[]; // Support multiple selections
  // Computed properties for backward compatibility
  selectedNodeId?: string;
  selectedBoundingBoxId?: string;
  selectedSvgImageId?: string;
  selectedEdgeId?: string;
}
