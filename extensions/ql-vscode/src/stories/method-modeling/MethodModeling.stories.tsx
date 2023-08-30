import * as React from "react";

import { Meta, StoryFn } from "@storybook/react";

import { MethodModeling as MethodModelingComponent } from "../../view/method-modeling/MethodModeling";
export default {
  title: "Method Modeling/Method Modeling",
  component: MethodModelingComponent,
} as Meta<typeof MethodModelingComponent>;

const Template: StoryFn<typeof MethodModelingComponent> = (args) => (
  <MethodModelingComponent {...args} />
);

export const MethodUnmodeled = Template.bind({});
MethodUnmodeled.args = { modelingStatus: "unmodeled" };

export const MethodModeled = Template.bind({});
MethodModeled.args = { modelingStatus: "unsaved" };

export const MethodSaved = Template.bind({});
MethodSaved.args = { modelingStatus: "saved" };