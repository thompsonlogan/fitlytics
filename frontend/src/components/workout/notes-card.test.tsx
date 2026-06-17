import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { NotesCard } from "./notes-card"

describe("NotesCard", () => {
  it("renders the coach note as one bullet per non-blank line (read-only)", () => {
    render(
      <NotesCard
        coachNotes={"Belt from set 2.\n\nStop 1 rep shy."}
        yourNotes=""
        onSaveYourNotes={() => {}}
      />
    )
    const bullets = screen.getAllByRole("listitem")
    expect(bullets.map((li) => li.textContent)).toEqual(["Belt from set 2.", "Stop 1 rep shy."])
  })

  it("shows a placeholder when there is no coach note", () => {
    render(<NotesCard coachNotes={null} yourNotes="" onSaveYourNotes={() => {}} />)
    expect(screen.getByText("No coach notes for this day.")).toBeInTheDocument()
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument()
  })

  it("shows an 'Add a note' affordance and edits → saves on blur", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<NotesCard coachNotes={null} yourNotes="" onSaveYourNotes={onSave} />)

    await user.click(screen.getByRole("button", { name: /add a note about this workout/i }))
    const textarea = screen.getByRole("textbox", { name: /your notes for this workout/i })
    await user.type(textarea, "Felt strong today")
    await user.tab() // blur

    expect(onSave).toHaveBeenCalledExactlyOnceWith("Felt strong today")
  })

  it("does not save when the note is unchanged", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<NotesCard coachNotes={null} yourNotes="Existing note" onSaveYourNotes={onSave} />)

    await user.click(screen.getByRole("button", { name: /edit your notes/i }))
    // blur without changing anything
    await user.tab()

    expect(onSave).not.toHaveBeenCalled()
  })

  it("saves an empty string when an existing note is cleared", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<NotesCard coachNotes={null} yourNotes="Old note" onSaveYourNotes={onSave} />)

    await user.click(screen.getByRole("button", { name: /edit your notes/i }))
    const textarea = screen.getByRole("textbox", { name: /your notes for this workout/i })
    await user.clear(textarea)
    await user.tab()

    expect(onSave).toHaveBeenCalledExactlyOnceWith("")
  })
})
