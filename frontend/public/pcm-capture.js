// Runs on the audio thread and hands raw microphone samples to the app.
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}

registerProcessor("pcm-capture", PcmCapture);
