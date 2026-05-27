# 3. Native Class Manipulation Support

To support modern utility-class CSS frameworks (such as Tailwind CSS or Bootstrap) and design token systems, we decided to support native element class name manipulation in addition to inline styling. The SDK exposes class manipulation APIs (adding, removing, and toggling classes) and generates a dedicated `update-classes` operation. This prevents layout styling operations from polluting class-driven HTML with inline style attributes.
