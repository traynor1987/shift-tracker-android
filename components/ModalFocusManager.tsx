"use client";

import { useEffect } from "react";
import { installModalFocusManagement } from "@/lib/modalAccessibility";

export default function ModalFocusManager() {
  useEffect(() => installModalFocusManagement(), []);
  return null;
}
