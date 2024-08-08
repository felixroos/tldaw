import { exportToBlob, getArrowBindings, Tldraw, useEditor } from "tldraw";
import { useSyncDemo } from "@tldraw/sync";
import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { useEffect } from "react";

export default function App() {
  const store = useSyncDemo({ roomId: "tldaw-test" });
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw store={store}>
        <Tldaw />
      </Tldraw>
    </div>
  );
}

let readJsonBlob = (blob) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = function () {
      resolve(JSON.parse(this.result));
    };
    reader.readAsText(blob);
  });

async function getGraph(editor) {
  const shapeIds = editor.getCurrentPageShapeIds();
  if (shapeIds.size === 0) return alert("No shapes on the canvas");

  // get json for shapes
  const blob = await exportToBlob({
    editor,
    ids: [...shapeIds],
    format: "json",
    opts: { background: false },
  });
  const json = await readJsonBlob(blob);
  // console.log("json", json);

  const shapes = new Map();
  json.shapes.forEach((shape) => shapes.set(shape.id, shape));

  // get edges from arrows
  const connections = json.shapes
    .filter((shape) => shape.type === "arrow")
    .map((shape) => {
      const index = shape.props.text;
      const bindings = getArrowBindings(editor, shape);
      const { start, end } = bindings;
      const startId = start.toId;
      const endId = end.toId;
      const label = `${shapes.get(startId).props.text} -> ${
        shapes.get(endId).props.text
      }`;
      return [startId, endId, index, label];
    })
    .filter(Boolean);

  // get nodes, parse text content
  const nodes = json.shapes
    .filter((shape) => !["arrow", "draw"].includes(shape.type))
    .map((shape) => {
      const ins = connections
        .filter((con) => con[1] === shape.id)
        .map((con) => con[0]);
      const [type, ...args] = shape.props.text.split(" ");
      return {
        id: shape.id,
        type,
        args,
        inLabels: ins.map((input) => shapes.get(input).props.text),
        ins,
      };
    });

  // create kabelsalat nodes
  let knodes = {};
  let out;
  nodes.forEach((node) => {
    if (node.type === "out") {
      knodes[node.id] = new Node("out");
      out = knodes[node.id];
    } else {
      knodes[node.id] = new Node(node.type);
      node.args.forEach((v) => {
        knodes[node.id].ins.push(n(Number(v)));
      });
    }
  });
  // connect nodes together
  connections.forEach(([start, end, inlet]) => {
    const node = nodes.find((n) => n.id === end);
    const index = inlet ? node.args.indexOf(inlet) : 0;
    if (index === -1) {
      console.log("args", node.args, inlet);
      throw new Error(
        "arrow must be given a name that matches a variable in the target arguments"
      );
    }
    knodes[end].ins[index] = knodes[start];
  });
  const graph = dac(out.ins[0]).exit();
  return graph;
}

const { SalatRepl } = kabelsalat;
const repl = new SalatRepl({
  base: "https://unpkg.com/@kabelsalat/web@0.1.0/dist/",
});

function Tldaw() {
  const editor = useEditor();
  useEffect(() => {
    async function keypress(e) {
      if (e.ctrlKey && e.key === "Enter") {
        try {
          const node = await getGraph(editor);
          console.log("node", node);
          repl.play(node);
        } catch (err) {
          console.log("err", err);
        }
      }
    }
    document.addEventListener("keypress", keypress);
    return () => {
      document.removeEventListener("keypress", keypress);
    };
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
