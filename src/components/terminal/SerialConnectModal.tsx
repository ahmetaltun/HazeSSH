import { useState, useEffect } from "react";
import {
  Cpu,
  RefreshCw,
  Sliders,
  Usb,
  X,
  Radio,
  Check,
  AlertCircle,
} from "lucide-react";
import { api } from "@/services/api";
import { useMultiplexerStore } from "@/stores/useMultiplexerStore";
import {
  type SerialPortInfo,
  type SerialConnectOptions,
  COMMON_BAUD_RATES,
} from "@/types/serial";

interface SerialConnectModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function SerialConnectModal({ isOpen, onClose }: SerialConnectModalProps) {
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [isLoadingPorts, setIsLoadingPorts] = useState(false);
  const [selectedPort, setSelectedPort] = useState<string>("");
  const [customPort, setCustomPort] = useState<string>("");
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [isCustomBaud, setIsCustomBaud] = useState(false);
  const [customBaudStr, setCustomBaudStr] = useState("115200");

  // Advanced serial options (default: 8N1 None)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dataBits, setDataBits] = useState<5 | 6 | 7 | 8>(8);
  const [parity, setParity] = useState<"none" | "odd" | "even">("none");
  const [stopBits, setStopBits] = useState<1 | 2>(1);
  const [flowControl, setFlowControl] = useState<"none" | "software" | "hardware">("none");

  const [error, setError] = useState<string | null>(null);
  const { openTab } = useMultiplexerStore();

  const fetchPorts = async () => {
    setIsLoadingPorts(true);
    setError(null);
    try {
      const detected = await api.serialListPorts();
      setPorts(detected);
      if (detected.length > 0 && !selectedPort) {
        setSelectedPort(detected[0].port_name);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to enumerate ports: ${msg}`);
    } finally {
      setIsLoadingPorts(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void fetchPorts();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const activePort = selectedPort === "custom" ? customPort.trim() : selectedPort;

  const handleConnect = () => {
    if (!activePort) {
      setError("Please select or enter a serial port.");
      return;
    }

    const finalBaud = isCustomBaud ? parseInt(customBaudStr, 10) : baudRate;
    if (isNaN(finalBaud) || finalBaud <= 0) {
      setError("Invalid baud rate specified.");
      return;
    }

    const serialOptions: SerialConnectOptions = {
      port_name: activePort,
      baud_rate: finalBaud,
      data_bits: dataBits,
      parity,
      stop_bits: stopBits,
      flow_control: flowControl,
    };

    const portShortName = activePort.split("/").pop() || activePort;

    openTab(
      {
        title: `Serial: ${portShortName} (${finalBaud})`,
        connectionType: "serial",
        serialOptions,
        status: "connecting",
      },
      `Serial: ${portShortName}`
    );

    onClose();
  };

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-lg bg-base-100 border border-base-300 shadow-2xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-base-200">
          <div className="flex items-center gap-2 text-primary">
            <Cpu className="w-5 h-5" />
            <h3 className="font-bold text-base text-base-content">
              Connect to Hardware Serial (UART)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-xs btn-square"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="alert alert-error text-xs py-2 mt-4 shadow-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4 mt-4">
          {/* Port Selection Section */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-base-content/80 flex items-center gap-1.5">
                <Usb className="w-3.5 h-3.5" />
                <span>Available Serial Ports</span>
              </label>
              <button
                type="button"
                onClick={fetchPorts}
                disabled={isLoadingPorts}
                className="btn btn-ghost btn-xs gap-1 text-[11px] text-primary"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingPorts ? "animate-spin" : ""}`} />
                <span>Scan Devices</span>
              </button>
            </div>

            {ports.length === 0 && !isLoadingPorts ? (
              <div className="border border-dashed border-base-300 rounded-lg p-3 bg-base-200/40 text-center space-y-2">
                <p className="text-xs text-base-content/60">
                  No hardware serial devices detected.
                </p>
                <p className="text-[11px] text-base-content/40">
                  Plug in your USB-to-UART adapter (e.g. FTDI, CP2102, CH340) or specify a manual path below.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {ports.map((p) => {
                  const isSelected = selectedPort === p.port_name;
                  const label = p.product || p.manufacturer || "Serial Port";
                  return (
                    <button
                      key={p.port_name}
                      type="button"
                      onClick={() => setSelectedPort(p.port_name)}
                      className={`w-full text-left p-2.5 rounded-lg border text-xs transition-colors flex items-center justify-between ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary font-medium shadow-xs"
                          : "border-base-300 bg-base-200/30 hover:bg-base-200"
                      }`}
                    >
                      <div className="truncate pr-2">
                        <div className="font-mono text-xs text-base-content">
                          {p.port_name}
                        </div>
                        <div className="text-[10px] text-base-content/60 truncate">
                          {label} {p.serial_number ? `(SN: ${p.serial_number})` : ""}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        <span className="badge badge-xs badge-neutral uppercase font-mono text-[9px]">
                          {p.port_type}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Manual custom port toggle */}
            <div className="mt-2 flex items-center gap-2">
              <input
                type="radio"
                name="port_selection"
                checked={selectedPort === "custom"}
                onChange={() => setSelectedPort("custom")}
                className="radio radio-xs radio-primary"
                id="custom_port_radio"
              />
              <label
                htmlFor="custom_port_radio"
                className="text-xs text-base-content/75 cursor-pointer"
              >
                Custom port path:
              </label>
              <input
                type="text"
                value={customPort}
                onChange={(e) => {
                  setCustomPort(e.target.value);
                  setSelectedPort("custom");
                }}
                onFocus={() => setSelectedPort("custom")}
                placeholder="/dev/tty.usbserial or COM1"
                className="input input-xs input-bordered flex-1 font-mono text-xs"
              />
            </div>
          </div>

          {/* Baud Rate Selection */}
          <div>
            <label className="text-xs font-semibold text-base-content/80 block mb-1.5 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5" />
              <span>Baud Rate</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_BAUD_RATES.map((rate) => {
                const isSelected = !isCustomBaud && baudRate === rate;
                return (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => {
                      setBaudRate(rate);
                      setIsCustomBaud(false);
                    }}
                    className={`btn btn-xs font-mono text-[11px] ${
                      isSelected ? "btn-primary" : "btn-ghost border border-base-300"
                    }`}
                  >
                    {rate}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setIsCustomBaud(true)}
                className={`btn btn-xs font-mono text-[11px] ${
                  isCustomBaud ? "btn-primary" : "btn-ghost border border-base-300"
                }`}
              >
                Custom
              </button>
            </div>

            {isCustomBaud && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-base-content/60">Custom Baud:</span>
                <input
                  type="number"
                  value={customBaudStr}
                  onChange={(e) => setCustomBaudStr(e.target.value)}
                  className="input input-xs input-bordered w-32 font-mono text-xs"
                  placeholder="e.g. 500000"
                />
              </div>
            )}
          </div>

          {/* Advanced Serial Settings (Collapsible) */}
          <div className="border border-base-300/80 rounded-lg p-2.5 bg-base-200/20">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full text-xs font-semibold text-base-content/75 hover:text-base-content"
            >
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                <span>Port Parameters ({dataBits}{parity.charAt(0).toUpperCase()}{stopBits})</span>
              </span>
              <span className="text-[10px] text-base-content/40">
                {showAdvanced ? "Hide ▲" : "Show ▼"}
              </span>
            </button>

            {showAdvanced && (
              <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-base-300/60 text-xs">
                {/* Data Bits */}
                <div>
                  <span className="text-[11px] text-base-content/60 block mb-1">
                    Data Bits
                  </span>
                  <select
                    value={dataBits}
                    onChange={(e) => setDataBits(Number(e.target.value) as 5 | 6 | 7 | 8)}
                    className="select select-xs select-bordered w-full font-mono"
                  >
                    <option value={8}>8 (Standard)</option>
                    <option value={7}>7</option>
                    <option value={6}>6</option>
                    <option value={5}>5</option>
                  </select>
                </div>

                {/* Parity */}
                <div>
                  <span className="text-[11px] text-base-content/60 block mb-1">
                    Parity
                  </span>
                  <select
                    value={parity}
                    onChange={(e) => setParity(e.target.value as "none" | "odd" | "even")}
                    className="select select-xs select-bordered w-full font-mono"
                  >
                    <option value="none">None (Standard)</option>
                    <option value="odd">Odd</option>
                    <option value="even">Even</option>
                  </select>
                </div>

                {/* Stop Bits */}
                <div>
                  <span className="text-[11px] text-base-content/60 block mb-1">
                    Stop Bits
                  </span>
                  <select
                    value={stopBits}
                    onChange={(e) => setStopBits(Number(e.target.value) as 1 | 2)}
                    className="select select-xs select-bordered w-full font-mono"
                  >
                    <option value={1}>1 (Standard)</option>
                    <option value={2}>2</option>
                  </select>
                </div>

                {/* Flow Control */}
                <div>
                  <span className="text-[11px] text-base-content/60 block mb-1">
                    Flow Control
                  </span>
                  <select
                    value={flowControl}
                    onChange={(e) =>
                      setFlowControl(e.target.value as "none" | "software" | "hardware")
                    }
                    className="select select-xs select-bordered w-full font-mono"
                  >
                    <option value="none">None</option>
                    <option value="hardware">Hardware (RTS/CTS)</option>
                    <option value="software">Software (XON/XOFF)</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Actions */}
        <div className="modal-action border-t border-base-200 pt-3 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm btn-ghost text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConnect}
            disabled={!activePort}
            className="btn btn-sm btn-primary text-xs gap-1.5"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Open Serial Console</span>
          </button>
        </div>
      </div>
    </div>
  );
}
