import type { FormEvent } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  size,
  useDismiss,
  useFloating,
  useFocus,
  useInteractions,
  useListNavigation,
  useRole,
} from "@floating-ui/react";
import { styled } from "styled-components";
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react";
import { SuggestBoxItem } from "./SuggestBoxItem";
import { useOpenKey } from "./useOpenKey";
import { findMatchingOptions, suggestedOptions } from "./suggestions";
import { LabelText } from "./LabelText";
import { hasAccessPathSyntaxError } from "./access-path";

const Input = styled(VSCodeTextField)<{ $error: boolean }>`
  width: 430px;

  border: ${(props) =>
    props.$error
      ? "1px solid var(--vscode-inputValidation-errorBorder)"
      : undefined};
`;

const Container = styled.div`
  width: 430px;
  display: flex;
  flex-direction: column;
  border-radius: 3px;
  font-size: 95%;

  background-color: var(--vscode-editorSuggestWidget-background);
  border: 1px solid var(--vscode-editorSuggestWidget-border);

  user-select: none;
`;

export const SuggestBox = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const listRef = useRef<Array<HTMLElement | null>>([]);

  const { refs, floatingStyles, context } = useFloating<HTMLInputElement>({
    whileElementsMounted: autoUpdate,
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: "bottom-start",
    middleware: [
      // Flip when the popover is too close to the bottom of the screen
      flip({ padding: 10 }),
      // Resize the popover to be fill the available height
      size({
        apply({ availableHeight, elements }) {
          Object.assign(elements.floating.style, {
            maxHeight: `${availableHeight}px`,
          });
        },
        padding: 10,
      }),
    ],
  });

  const focus = useFocus(context);
  const role = useRole(context, { role: "listbox" });
  const dismiss = useDismiss(context);
  const openKey = useOpenKey(context);
  const listNav = useListNavigation(context, {
    listRef,
    activeIndex,
    onNavigate: setActiveIndex,
    virtual: true,
    loop: true,
  });

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions(
    [focus, role, dismiss, openKey, listNav],
  );

  const handleInput = useCallback((event: FormEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    setInputValue(value);
    setIsOpen(true);
    setActiveIndex(0);
  }, []);

  const suggestionItems = useMemo(() => {
    return findMatchingOptions(suggestedOptions, inputValue);
  }, [inputValue]);

  const hasSyntaxError = useMemo(
    () => hasAccessPathSyntaxError(inputValue),
    [inputValue],
  );

  return (
    <>
      <Input
        {...getReferenceProps({
          ref: refs.setReference,
          value: inputValue,
          onInput: handleInput,
          "aria-autocomplete": "list",
          onKeyDown: (event) => {
            if (
              event.key === "Enter" &&
              activeIndex != null &&
              suggestionItems[activeIndex]
            ) {
              setInputValue(suggestionItems[activeIndex].value);
              setActiveIndex(null);
              setIsOpen(false);
            }
          },
        })}
        $error={hasSyntaxError}
      />
      <FloatingPortal>
        {isOpen && suggestionItems.length > 0 && (
          <FloatingFocusManager
            context={context}
            initialFocus={-1}
            visuallyHiddenDismiss
          >
            <Container
              {...getFloatingProps({
                ref: refs.setFloating,
                style: floatingStyles,
              })}
            >
              {suggestionItems.map((item, index) => (
                <SuggestBoxItem
                  key={item.label}
                  {...getItemProps({
                    key: item.label,
                    ref(node) {
                      listRef.current[index] = node;
                    },
                    onClick() {
                      refs.domReference.current?.focus();
                    },
                  })}
                  active={activeIndex === index}
                  icon={item.icon}
                  labelText={<LabelText item={item} inputValue={inputValue} />}
                  detailsText={item.details}
                />
              ))}
            </Container>
          </FloatingFocusManager>
        )}
      </FloatingPortal>
    </>
  );
};
