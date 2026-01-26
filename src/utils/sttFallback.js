import inerror from "../assets/verbalpreset/inerror.wav"

export async function sttFallback() {
    var inerroraudio = new Audio(inerror);
    inerroraudio.play();
  }