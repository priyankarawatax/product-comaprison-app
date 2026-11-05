import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

type FeatureRequestResponse =
  | { ok: true }
  | { ok: false; error: string };

export function FeatureRequestButton() {
  return (
    <s-button
      slot="secondary-actions"
      commandFor="feature-request-modal"
      command="--show"
    >
      Request feature
    </s-button>
  );
}
export function FeatureRequest() {
  const fetcher = useFetcher<FeatureRequestResponse>();
  const shopify = useAppBridge();
  const modalId = "feature-request-modal";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [clientError, setClientError] = useState("");
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      setTitle("");
      setDescription("");
      setClientError("");
      void shopify.modal.hide(modalId);
      shopify.toast.show("Feature request sent");
    }
  }, [fetcher.data, fetcher.state, modalId, shopify]);

  const submit = () => {
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    if (!trimmedTitle || !trimmedDescription) {
      setClientError("Enter both a title and description.");
      return;
    }
    setClientError("");
    fetcher.submit(
      { title: trimmedTitle, description: trimmedDescription },
      { method: "post", action: "/app/request-feature" },
    );
  };

  const error =
    clientError || (fetcher.data && !fetcher.data.ok ? fetcher.data.error : "");

  return (
    <>

      <s-modal id={modalId} heading="Request a feature">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Tell us about a new feature or customization you would like for your store. We will contact you as soon as possible.
          </s-paragraph>
          {error ? <s-banner tone="critical">{error}</s-banner> : null}
          <s-text-field
            label="Title"
            name="title"
            value={title}
            maxLength={160}
            required
            disabled={isSubmitting}
            onInput={(event) => {
              setTitle(event.currentTarget.value);
              setClientError("");
            }}
          />
          <s-text-area
            label="Description"
            name="description"
            value={description}
            maxLength={5000}
            rows={6}
            required
            disabled={isSubmitting}
            onInput={(event) => {
              setDescription(event.currentTarget.value);
              setClientError("");
            }}
          />
        </s-stack>
        <s-button
          slot="primary-action"
          variant="primary"
          loading={isSubmitting}
          disabled={isSubmitting}
          onClick={submit}
        >
          Send request
        </s-button>
        <s-button
          slot="secondary-actions"
          commandFor={modalId}
          command="--hide"
          disabled={isSubmitting}
        >
          Cancel
        </s-button>
      </s-modal>
    </>
  );
}
