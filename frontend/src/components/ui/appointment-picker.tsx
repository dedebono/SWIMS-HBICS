"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, isSameDay } from "date-fns";
import { id } from "date-fns/locale";
import { useState } from "react";

export interface AvailabilitySlot {
  slot_id: string;
  slot_start: string;
  slot_end: string;
  is_available: boolean;
  appointment_id?: string | null;
}

interface AppointmentPickerProps {
  slots: AvailabilitySlot[];
  selectedDate: Date | undefined;
  onDateSelect: (date: Date | undefined) => void;
  selectedSlotId: string | null;
  onSlotSelect: (slotId: string | null) => void;
  disabledBefore?: Date;
}

export function AppointmentPicker({
  slots,
  selectedDate,
  onDateSelect,
  selectedSlotId,
  onSlotSelect,
  disabledBefore = new Date(),
}: AppointmentPickerProps) {
  // Dates that have at least one available slot
  const availableDates = slots
    .filter((s) => s.is_available)
    .map((s) => new Date(s.slot_start));

  // Time slots for the selected date
  const slotsForDate = selectedDate
    ? slots.filter(
        (s) =>
          s.is_available && isSameDay(new Date(s.slot_start), selectedDate),
      )
    : [];

  return (
    <div className="rounded-lg border border-border">
      <div className="flex max-sm:flex-col">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(newDate) => {
            if (newDate) {
              onDateSelect(newDate);
              onSlotSelect(null); // reset slot when date changes
            }
          }}
          className="p-2 sm:pe-5 bg-background"
          disabled={[
            { before: disabledBefore },
            (date: Date) => {
              // Only allow dates that have at least one available slot
              if (availableDates.length === 0) return false;
              const hasSlot = availableDates.some((d) => isSameDay(d, date));
              return !hasSlot;
            },
          ]}
          modifiers={{
            available: availableDates,
          }}
          modifiersClassNames={{
            available: "bg-primary/10 text-primary font-medium",
          }}
        />
        <div className="relative w-full max-sm:h-48 sm:w-40">
          <div className="absolute inset-0 border-border py-4 max-sm:border-t">
            <ScrollArea className="h-full border-border sm:border-s">
              <div className="space-y-3">
                <div className="flex h-5 shrink-0 items-center px-5">
                  <p className="text-sm font-medium">
                    {selectedDate
                      ? format(selectedDate, "EEEE, d", { locale: id })
                      : "Pilih tanggal"}
                  </p>
                </div>
                <div className="grid gap-1.5 px-5 max-sm:grid-cols-2">
                  {selectedDate && slotsForDate.length === 0 && (
                    <p className="text-xs text-muted-foreground col-span-full py-2">
                      Tidak ada slot tersedia
                    </p>
                  )}
                  {slotsForDate.map(({ slot_id, slot_start }) => {
                    const time = format(new Date(slot_start), "HH:mm");
                    return (
                      <Button
                        key={slot_id}
                        variant={selectedSlotId === slot_id ? "default" : "outline"}
                        size="sm"
                        className="w-full"
                        onClick={() =>
                          onSlotSelect(selectedSlotId === slot_id ? null : slot_id)
                        }
                      >
                        {time}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}
