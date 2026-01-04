import { useState } from "react";
import mascot from "../assets/mascot.png";

function Notch({ taskbarHeight = 0 }) {
  const bottomOffset = taskbarHeight + 10;
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState("bottom-left");
  const isRight = position.includes("right");
  const isBottom = position.includes("bottom");
  const containerSideClass = isRight ? "right-0" : "left-0";
  const rowDirClass = isRight ? "flex-row-reverse" : "flex-row";
  const overlapMargin = isRight ? "-ml-17" : "-mr-17";
  const padClass = isRight ? "pr-15 pl-5" : "pl-15 pr-5";
  const verticalStyle = isBottom
    ? { bottom: `${bottomOffset}px`, top: "auto" }
    : { top: "10px", bottom: "auto" };
  const moveBtnClass = (key) =>
    key === position
      ? "w-full border-2 border-black p-5 inter rounded-2xl flex justify-between items-center"
      : "w-full border border-gray-400 p-5 inter rounded-2xl flex justify-between items-center";
  const tooltipDirClass = isBottom ? "" : "tooltip-bottom";

  return (
    <div
      className={`fixed ${containerSideClass} ${rowDirClass} flex items-center gap-2 mx-4 transition-all duration-300 ease-in-out`}
      style={verticalStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main notch button */}
      <div className={`w-15 h-15 p-2 border brandborderdark rounded-full flex items-center justify-center brandbgdark shrink-0 ${overlapMargin} z-10 relative`}>
        <img
          src={mascot}
          alt="Mascot"
          className="w-full h-full object-contain rounded-full"
          draggable="false"
        />
      </div>
      

      {/* Expanded buttons container */}
      <div
        className={`flex bric items-center gap-2 overflow transition-all duration-300 ease-in-out border brandborderdark brandbgdark h-15 rounded-full ${padClass} relative z-0 ${
          isHovered ? "max-w-96 opacity-100" : "max-w-0 opacity-0"
        }`}
      >
        <div className={`tooltip border ${tooltipDirClass}`} data-tip="Settings">
          <button className="btn btn-sm btn-ghost text-lg brandbgdark text-white rounded-full shrink-0 transition-transform duration-200 hover:scale-110 border-0 hover:border-0">
            <i className="bi bi-gear-fill"></i>
          </button>
        </div>
        <div className={`tooltip ${tooltipDirClass}`} data-tip="Help">
          <button
            onClick={() => document.getElementById("helpmodal").showModal()}
            className="btn btn-sm btn-ghost text-lg brandbgdark text-white rounded-full shrink-0 transition-transform duration-200 hover:scale-110 border-0 hover:border-0"
          >
            <i className="bi bi-info-circle-fill"></i>
          </button>
        </div>

        <div className={`tooltip ${tooltipDirClass}`} data-tip="Move Theo">
          <button
            onClick={() => document.getElementById("movemodal").showModal()}
            className="btn btn-sm btn-ghost text-lg brandbgdark text-white rounded-full shrink-0 transition-transform duration-200 hover:scale-110 border-0 hover:border-0"
          >
            <i className="bi bi-arrows-move"></i>
          </button>
        </div>

        <div className={`tooltip ${tooltipDirClass}`} data-tip="Quit">
          <button
            onClick={() => {
              if (window.electron?.ipcRenderer) {
                window.electron.ipcRenderer.send("quit-app");
              }
            }}
            className="btn btn-sm btn-ghost text-lg brandbgdark text-white rounded-full shrink-0 transition-transform duration-200 hover:scale-110 border-0 hover:border-0"
          >
            <i className="bi bi-escape"></i>
          </button>
        </div>
      </div>

      <dialog id="helpmodal" className="modal ">
        <div className="modal-box brandbg border-2 rounded-4xl p-8 border-black relative">
          <form method="dialog" className="absolute top-4 right-4">
            <button className="btn btn-ghost btn-sm p-0 w-8 h-8 min-h-0 border-0 hover:bg-transparent hover:border-0 hover:scale-100">
              <i className="bi bi-x-circle-fill text-2xl"></i>
            </button>
          </form>
          <h3 className="font-semibold text-3xl bric ">Hey there! I'm Theo.</h3>
          <p className="text-gray-500 inter  text-sm font-light mt-1.5">
            Press Ctrl + Win to start talking to Theo.
          </p>
          <div>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-xl bric mb-2 ">
                  For caregivers:
                </h3>
                <div className="brandbg border border-black rounded-2xl p-3.5">
                  <a href="#">
                    <p className="text-black inter  text-sm  mt-1.5">
                      Learn how you and your assisted individual can use Theo to
                      enhance your work.
                    </p>
                  </a>
                </div>
              </div>
              <img
                src={mascot}
                alt=""
                className="shrink-0 w-50 h-50 object-contain"
                draggable="false"
              />
            </div>
          </div>
        </div>
      </dialog>
      {/* SEPERATION */}

      <dialog id="movemodal" className="modal">
        <div className="modal-box brandbg text-center border-2 rounded-4xl p-8 border-black relative overflow-visible">
          <img
            src={mascot}
            alt=""
            draggable="false"
            className="absolute -top-16 left-1/2 -translate-x-1/2 w-30 h-30 object-contain"
          />

          <form method="dialog" className="absolute top-4 right-4">
            <button className="btn btn-ghost btn-sm p-0 w-8 h-8 min-h-0 border-0 hover:bg-transparent">
              <i className="bi bi-x-circle-fill text-2xl"></i>
            </button>
          </form>

          <h3 className="font-semibold text-3xl bric mt-5">Modal Position</h3>
          <p className="text-gray-500 inter text-sm font-light mt-1.5">
            Select a corner of your screen to have Theo live!
          </p>
          <div id="moveButtons" className="mt-5 flex flex-col gap-3">
            <button onClick={() => setPosition("bottom-left")} className={moveBtnClass("bottom-left")}>
              <span>Bottom-Left</span>
              <span className="text-2xl">
                <i className="bi bi-arrow-down-left"></i>
              </span>
            </button>
            <button onClick={() => setPosition("top-left")} className={moveBtnClass("top-left")}>
              <span>Top-Left</span>
              <span className="text-2xl">
                <i className="bi bi-arrow-up-left"></i>
              </span>
            </button>
            <button onClick={() => setPosition("bottom-right")} className={moveBtnClass("bottom-right")}>
              <span>Bottom-Right</span>
              <span className="text-2xl">
                <i className="bi bi-arrow-down-right"></i>
              </span>
            </button>
            <button onClick={() => setPosition("top-right")} className={moveBtnClass("top-right")}>
              <span>Top-Right</span>
              <span className="text-2xl">
                <i className="bi bi-arrow-up-right"></i>
              </span>
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

export default Notch;
