import { NextRequest } from 'next/server';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

export const dynamic = 'force-dynamic';

// Global cache prevents Next.js from creating ghost connections on reload
const globalForSerial = global as unknown as { activePort: SerialPort | null };

export async function GET(req: NextRequest) {
  const portName = 'COM10'; 
  const baudRate = 115200;

  const stream = new ReadableStream({
    async start(controller) {
      const sendLog = (msg: string) => {
        try { controller.enqueue(`data: ${JSON.stringify({ text: msg })}\n\n`); } catch (e) {}
      };

      try {
        // Kill any surviving ghost ports from previous React renders
        if (globalForSerial.activePort && globalForSerial.activePort.isOpen) {
          await new Promise<void>((resolve) => {
            globalForSerial.activePort!.close(() => resolve());
          });
        }

        const port = new SerialPort({ path: portName, baudRate, autoOpen: false });
        globalForSerial.activePort = port;
        const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

        // Open manually and block DTR/RTS to prevent board resets
        port.open((err) => {
          if (err) {
            sendLog(`\n[FATAL ERROR] Port busy or denied: ${err.message}\n`);
            controller.close();
            return;
          }
          port.set({ dtr: false, rts: false }, (err) => {
            if (err) console.error("Pin release error:", err);
          });
          sendLog(`\n[SYSTEM] Transparent Monitor Connected to ${portName}.\n`);
        });

        parser.on('data', (data) => {
          sendLog(data + '\n');
        });

        port.on('error', (err) => {
          sendLog(`\n[ERROR] ${err.message}\n`);
        });

        req.signal.addEventListener('abort', () => {
          if (port.isOpen) {
            port.close();
          }
          globalForSerial.activePort = null;
        });
        
      } catch (err: any) {
        sendLog(`\n[FATAL ERROR] ${err.message}\n`);
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}