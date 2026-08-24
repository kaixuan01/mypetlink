// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Field } from "./Field";
import { Select } from "./Select";

afterEach(cleanup);

describe("Field", () => {
  it("associates native controls with labels, helper text, errors, and required state", () => {
    render(
      <Field
        errorText="Add a pet name."
        helperText="Use the name your pet knows."
        htmlFor="pet-name"
        label="Pet name"
        required
      >
        <input className="brand-input" />
      </Field>
    );

    const input = screen.getByLabelText(/Pet name/);
    const describedBy = input.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(input.id).toBe("pet-name");
    expect(input.hasAttribute("required")).toBe(false);
    expect(input.getAttribute("aria-required")).toBe("true");
    expect((input as HTMLInputElement).checkValidity()).toBe(true);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(describedBy).toHaveLength(2);
    expect(describedBy).toContain(screen.getByText("Use the name your pet knows.").id);
    expect(describedBy).toContain(screen.getByText("Add a pet name.").id);
  });

  it("preserves a caller-owned control ID and its label association", () => {
    render(
      <Field htmlFor="generated-name" label="Pet name">
        <input id="caller-owned-name" />
      </Field>
    );

    const input = screen.getByLabelText("Pet name");
    expect(input.id).toBe("caller-owned-name");
    expect(screen.getByText("Pet name").closest("label")?.htmlFor).toBe(
      "caller-owned-name"
    );
  });

  it("merges existing ARIA relationships with generated helper associations", () => {
    render(
      <>
        <span id="external-description">Existing description</span>
        <span id="external-label">Existing label</span>
        <Field helperText="Generated helper" id="pet-kind" label="Pet type">
          <button
            aria-controls="pet-kind-options"
            aria-describedby="external-description"
            aria-expanded="false"
            aria-labelledby="external-label"
            role="combobox"
            type="button"
          />
        </Field>
      </>
    );

    const control = screen.getByRole("combobox");
    expect(control.getAttribute("aria-describedby")?.split(" ")).toEqual([
      "external-description",
      "pet-kind-helper",
    ]);
    expect(control.getAttribute("aria-labelledby")?.split(" ")).toEqual([
      "external-label",
      "pet-kind-label",
    ]);
  });

  it("supports native textareas and optional indication", () => {
    render(
      <Field htmlFor="bio" label="Bio" optional>
        <textarea />
      </Field>
    );

    expect(screen.getByLabelText(/Bio/).tagName).toBe("TEXTAREA");
    expect(screen.getByText("(optional)")).toBeTruthy();
  });

  it("labels a custom Select without creating an invalid label element", () => {
    const { container } = render(
      <Field helperText="Choose one pet type." id="pet-type" label="Pet type">
        <Select
          onChange={vi.fn()}
          options={[
            { value: "cat", label: "Cat" },
            { value: "dog", label: "Dog" },
          ]}
          value="dog"
        />
      </Field>
    );

    const trigger = screen.getByRole("combobox", { name: "Pet type" });
    expect(container.querySelector("label")).toBeNull();
    expect(trigger.getAttribute("aria-labelledby")).toBe("pet-type-label");
    expect(trigger.getAttribute("aria-describedby")).toBe("pet-type-helper");
  });

  it("labels a radiogroup without wrapping it in a label", () => {
    const { container } = render(
      <Field errorText="Choose an audience." id="audience" label="Audience">
        <div role="radiogroup">
          <button aria-checked="false" role="radio" type="button">
            Only me
          </button>
        </div>
      </Field>
    );

    const group = screen.getByRole("radiogroup", { name: "Audience" });
    expect(container.querySelector("label")).toBeNull();
    expect(group.getAttribute("aria-invalid")).toBe("true");
    expect(group.getAttribute("aria-describedby")).toBe("audience-error");
  });
});
