import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { spawn } from "node:child_process";
import { AssemblyAI } from "assemblyai";
// const { ASSEMBLYAI_API_KEY } = process.env;
const apiKey = process.env.ASSEMBLYAI_API_KEY;

const client = new AssemblyAI({ apiKey });
const transcriber = client.streaming.transcriber({
  speechModel: "universal-3-5-pro",
  sampleRate: 16_000,
  formatTurns: true,
  connectTimeout: 10000,
});

let microphone;
let stopping = false;

transcriber.on("open", ({ id }) => {
  console.log(`Connected (${id}). Speak now; press Ctrl+C to stop.`);

  microphone = spawn("sox", [
    "--default-device", "--no-show-progress",
    "--rate", "16000", "--channels", "1",
    "--encoding", "signed-integer", "--bits", "16",
    "--type", "raw", "-",
  ]);

  microphone.stdout.on("data", (audio) => transcriber.sendAudio(audio));
  microphone.stderr.on("data", (data) =>
    console.error(`Microphone: ${data.toString().trim()}`)
  );
  microphone.on("error", (error) =>
    console.error("Could not start SoX:", error.message)
  );
});

transcriber.on("turn", (turn) => {
  if (!turn.transcript) return;
  process.stdout.write(
    turn.end_of_turn ? `\rFinal: ${turn.transcript}\n` : `\rLive: ${turn.transcript}`
  );
});

transcriber.on("error", (error) => console.error("\nStreaming error:", error));
transcriber.on("close", (code, reason) => {
  console.log(`\nDisconnected (${code}${reason ? `: ${reason}` : ""}).`);
});

async function stop() {
  if (stopping) return;
  stopping = true;
  microphone?.kill();
  await transcriber.close(); // Finalizes the open turn and ends billing.
}

process.on("SIGINT", () => stop().catch(console.error));
await transcriber.connect();
