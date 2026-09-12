// Blink an LED on GPIO2 with a 3000 ms delay
// Serial output shows the LED state

const int ledPin = 2;          // GPIO2 (built‑in LED on many boards)
const unsigned long period = 3000; // 3000 ms = 3 seconds

void setup() {
  Serial.begin(115200);
  while (!Serial) { ; }               // wait for Serial (optional)
  pinMode(ledPin, OUTPUT);
  Serial.println("Starting LED blink example");
}

void loop() {
  digitalWrite(ledPin, HIGH);         // LED ON
  Serial.println("LED ON");
  delay(period);

  digitalWrite(ledPin, LOW);          // LED OFF
  Serial.println("LED OFF");
  delay(period);
}