import { useState } from "react";
import mascot from "../assets/mascot.png";

function Notch({ taskbarHeight = 0 }) {
  const bottomOffset = taskbarHeight + 10;
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="fixed left-0 flex items-center gap-2 mx-4 transition-all duration-300 ease-in-out"
      style={{ bottom: `${bottomOffset}px` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main notch button */}
      <div className="w-15 h-15 p-2 border brandborderdark rounded-full flex items-center justify-center brandbgdark shrink-0 -mr-17 z-10 relative">
        <img
          src={mascot}
          alt="Mascot"
          className="w-full h-full object-contain rounded-full"
        />
      </div>

      {/* Expanded buttons container */}
      <div
        className={`flex bric items-center gap-2 overflow transition-all duration-300 ease-in-out border brandborderdark brandbgdark h-15 rounded-full pl-15 pr-5 relative z-0 ${
          isHovered ? "max-w-96 opacity-100" : "max-w-0 opacity-0"
        }`}
      >
        <div className="tooltip border " data-tip="Settings">
          <button className="btn btn-sm btn-ghost text-lg brandbgdark text-white rounded-full shrink-0 transition-transform duration-200 hover:scale-110 border-0 hover:border-0">
            <i className="bi bi-gear-fill"></i>
          </button>
        </div>
        <div className="tooltip" data-tip="Help">
          <button className="btn btn-sm btn-ghost text-lg brandbgdark text-white rounded-full shrink-0 transition-transform duration-200 hover:scale-110 border-0 hover:border-0">
            <i className="bi bi-info-circle-fill"></i>
          </button>
        </div>

        <div className="tooltip" data-tip="Move Theo">
          <button className="btn btn-sm btn-ghost text-lg brandbgdark text-white rounded-full shrink-0 transition-transform duration-200 hover:scale-110 border-0 hover:border-0">
            <i className="bi bi-arrows-move"></i>
          </button>
        </div>
      </div>
    </div>
  );
}

export default Notch;
