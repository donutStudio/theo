import { createRoot } from "react-dom/client";
import Test from "./components/test";

const App = () => {
  return <Test />;
};

const container = document.getElementById("root");
const root = createRoot(container);
root.render(<App />);
