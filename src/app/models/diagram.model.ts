export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Tendril {
  id: string;
  name: string;
  position: Position; // relative to node
  type: 'incoming' | 'outgoing';
  exposed: boolean;
  attributes: { [key: string]: any };
  borderColor: string;
  borderThickness: number;
}

export type NodeShape = 'rectangle' | 'circle' | 'pill' | 'cylinder' | 'diamond' | 'parallelogram' | 'document' | 'roundedRectangle' | 'hexagon' | 'triangle' | 'trapezoid' | 'text' | 'stickman' | 'callout';

export interface Node {
  id: string;
  name: string;
  position: Position;
  size: Size;
  shape: NodeShape;
  borderColor: string;
  fillColor: string;
  tendrils: Tendril[];
  innerDiagram?: Diagram;
  notes?: string;
  attributes: { [key: string]: any };
}

export interface Edge {
  id: string;
  fromNodeId: string;
  fromTendrilId: string;
  toNodeId: string;
  toTendrilId: string;
  name?: string;
  attributes: { [key: string]: any };
}

export interface BoundingBox {
  id: string;
  position: Position;
  size: Size;
  label: string;
  fillColor: string;
  borderColor: string;
  attributes: { [key: string]: any };
}

export interface SvgImage {
  id: string;
  position: Position;
  size: Size;
  svgContent: string;
  fileName: string;
  label: string;
  tendrils: Tendril[];
  attributes: { [key: string]: any };
}

export interface Diagram {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
  boundingBoxes: BoundingBox[];
  svgImages: SvgImage[];
  attributes: { [key: string]: any };
}

export interface DiagramState {
  currentDiagram: Diagram;
  diagramStack: Diagram[]; // for navigation history
  selectedNodeId?: string;
  selectedTendrilId?: string;
  selectedBoundingBoxId?: string;
  selectedSvgImageId?: string;
  selectedEdgeId?: string;
}
