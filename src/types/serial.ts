import { z } from "zod";

export const SerialPortInfoSchema = z.object({
  port_name: z.string(),
  port_type: z.enum(["usb", "pci", "bluetooth", "unknown"]),
  manufacturer: z.string().nullable().optional(),
  product: z.string().nullable().optional(),
  serial_number: z.string().nullable().optional(),
  vid: z.number().nullable().optional(),
  pid: z.number().nullable().optional(),
});

export type SerialPortInfo = z.infer<typeof SerialPortInfoSchema>;

export const SerialConnectOptionsSchema = z.object({
  port_name: z.string().min(1, "Serial port name is required"),
  baud_rate: z.number().int().min(300).max(4000000).default(115200),
  data_bits: z.union([z.literal(5), z.literal(6), z.literal(7), z.literal(8)]).default(8).optional(),
  parity: z.enum(["none", "odd", "even"]).default("none").optional(),
  stop_bits: z.union([z.literal(1), z.literal(2)]).default(1).optional(),
  flow_control: z.enum(["none", "software", "hardware"]).default("none").optional(),
});

export type SerialConnectOptions = z.infer<typeof SerialConnectOptionsSchema>;

export const COMMON_BAUD_RATES = [
  9600,
  19200,
  38400,
  57600,
  115200,
  230400,
  460800,
  921600,
] as const;
