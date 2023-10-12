import { ModeledMethodValidationError } from "../../model-editor/shared/validation";
import TextButton from "../common/TextButton";
import { Alert } from "../common";
import * as React from "react";
import { useCallback } from "react";

type Props = {
  error: ModeledMethodValidationError;
  setSelectedIndex: (index: number) => void;
};

export const ModeledMethodAlert = ({ error, setSelectedIndex }: Props) => {
  const handleClick = useCallback(() => {
    setSelectedIndex(error.index);
  }, [error.index, setSelectedIndex]);

  return (
    <Alert
      role="alert"
      type="error"
      title={error.title}
      message={
        <>
          {error.message}{" "}
          <TextButton onClick={handleClick}>{error.actionText}</TextButton>
        </>
      }
    />
  );
};
