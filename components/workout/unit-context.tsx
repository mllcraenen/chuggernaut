"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Unit } from "@/lib/units";
import { UNITS_KEY } from "@/lib/units";

const UnitContext = createContext<{ unit: Unit; setUnit: (u: Unit) => void }>({
  unit: "kg",
  setUnit: () => {},
});

export function UnitProvider({ children }: { children: React.ReactNode }) {
  const [unit, setUnitState] = useState<Unit>("kg");

  useEffect(() => {
    const saved = localStorage.getItem(UNITS_KEY);
    if (saved === "lbs" || saved === "kg") setUnitState(saved);
  }, []);

  function setUnit(u: Unit) {
    setUnitState(u);
    localStorage.setItem(UNITS_KEY, u);
  }

  return <UnitContext.Provider value={{ unit, setUnit }}>{children}</UnitContext.Provider>;
}

export function useUnit(): { unit: Unit; setUnit: (u: Unit) => void } {
  return useContext(UnitContext);
}
