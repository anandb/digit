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

export interface Node {
  id: string;
  name: string;
  position: Position;
  size: Size;
  borderColor: string;
  fillColor: string;
  tendrils: Tendril[];
  innerDiagram?: Diagram;
  attributes: { [key: string]: any };
}

export interface Edge {
  id: string;
  fromNodeId: string;
  fromTendrilId: string;
  toNodeId: string;
  toTendrilId: string;
  attributes: { [key: string]: any };
}

export interface Diagram {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
  attributes: { [key: string]: any };
}

export interface DiagramState {
  currentDiagram: Diagram;
  diagramStack: Diagram[]; // for navigation history
  selectedNodeId?: string;
  selectedTendrilId?: string;
}
