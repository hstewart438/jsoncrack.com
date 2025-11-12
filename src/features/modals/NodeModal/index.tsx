import React from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, TextInput, Group } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import toast from "react-hot-toast";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useFile from "../../../store/useFile";
import useJson from "../../../store/useJson";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const nodes = useGraph(state => state.nodes);
  const setSelectedNode = useGraph(state => state.setSelectedNode);
  const setContents = useFile(state => state.setContents);
  const getContents = useFile(state => state.getContents);
  const getJson = useJson(state => state.getJson);
  
  const [isEditMode, setIsEditMode] = React.useState(false);
  const [editedFields, setEditedFields] = React.useState<Record<string, string>>({});

  // Reset edit mode when modal opens/closes and initialize edited fields
  React.useEffect(() => {
    if (opened && nodeData) {
      setIsEditMode(false);
      
      // Initialize editedFields based on node data
      const fields: Record<string, string> = {};
      
      if (nodeData.text.length === 1 && !nodeData.text[0].key) {
        // Single primitive value
        fields["value"] = String(nodeData.text[0].value ?? "");
      } else {
        // Object with key-value pairs
        nodeData.text.forEach(row => {
          if (row.type !== "array" && row.type !== "object" && row.key) {
            fields[row.key] = String(row.value ?? "");
          }
        });
      }
      
      setEditedFields(fields);
    }
  }, [opened, nodeData]);

  const handleEdit = () => {
    setIsEditMode(true);
  };

  const handleCancel = () => {
    setIsEditMode(false);
    
    // Reset edited fields to original values
    if (nodeData) {
      const fields: Record<string, string> = {};
      
      if (nodeData.text.length === 1 && !nodeData.text[0].key) {
        fields["value"] = String(nodeData.text[0].value ?? "");
      } else {
        nodeData.text.forEach(row => {
          if (row.type !== "array" && row.type !== "object" && row.key) {
            fields[row.key] = String(row.value ?? "");
          }
        });
      }
      
      setEditedFields(fields);
    }
  };

  const handleFieldChange = (key: string, value: string) => {
    setEditedFields(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    try {
      // Get the current full JSON
      const fullJson = JSON.parse(getJson());
      
      // Update the JSON at the specified path
      if (nodeData?.path && nodeData.path.length > 0) {
        // Navigate to the parent object/array
        let current = fullJson;
        for (let i = 0; i < nodeData.path.length - 1; i++) {
          current = current[nodeData.path[i]];
        }
        
        // Update the value at the final path segment
        const lastKey = nodeData.path[nodeData.path.length - 1];
        
        // If the node has only one text entry without a key, it's a primitive value
        if (nodeData.text.length === 1 && !nodeData.text[0].key) {
          // Try to parse as JSON to handle numbers, booleans, etc.
          try {
            current[lastKey] = JSON.parse(editedFields["value"]);
          } catch {
            // If parsing fails, treat as string
            current[lastKey] = editedFields["value"];
          }
        } else {
          // Otherwise, it's an object - update individual fields
          if (typeof current[lastKey] === 'object' && current[lastKey] !== null) {
            Object.keys(editedFields).forEach(key => {
              try {
                // Try to parse value as JSON to preserve types
                current[lastKey][key] = JSON.parse(editedFields[key]);
              } catch {
                // If parsing fails, use as string
                current[lastKey][key] = editedFields[key];
              }
            });
          }
        }
      } else {
        // If there's no path, we're editing the root
        Object.keys(editedFields).forEach(key => {
          try {
            fullJson[key] = JSON.parse(editedFields[key]);
          } catch {
            fullJson[key] = editedFields[key];
          }
        });
      }
      
      // Immediately update the nodeData with new values for instant UI update
      if (nodeData) {
        const updatedNodeData = { ...nodeData };
        
        if (updatedNodeData.text.length === 1 && !updatedNodeData.text[0].key) {
          // Update single primitive value
          try {
            updatedNodeData.text[0].value = JSON.parse(editedFields["value"]);
          } catch {
            updatedNodeData.text[0].value = editedFields["value"];
          }
        } else {
          // Update object fields
          updatedNodeData.text = updatedNodeData.text.map(row => {
            if (row.key && editedFields[row.key] !== undefined) {
              try {
                return { ...row, value: JSON.parse(editedFields[row.key]) };
              } catch {
                return { ...row, value: editedFields[row.key] };
              }
            }
            return row;
          });
        }
        
        // Immediately update the selected node for instant display refresh
        setSelectedNode(updatedNodeData);
      }
      
      // Update the content in the store (this will trigger graph re-parse in background)
      const updatedJsonString = JSON.stringify(fullJson, null, 2);
      setContents({ contents: updatedJsonString });
      
      toast.success("Node updated successfully!");
      setIsEditMode(false);
      
      // Background sync: Wait for the graph to fully update, then sync with parsed node
      setTimeout(() => {
        if (nodeData) {
          const updatedNodes = useGraph.getState().nodes;
          const updatedNode = updatedNodes.find(n => n.id === nodeData.id);
          if (updatedNode) {
            setSelectedNode(updatedNode);
          }
        }
      }, 500);
    } catch (error) {
      toast.error("Failed to update node. Please check your edits.");
      console.error(error);
    }
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <CloseButton onClick={onClose} />
          </Flex>
          <ScrollArea.Autosize mah={250} maw={600}>
            {isEditMode ? (
              <Stack gap="xs" miw={350} maw={600}>
                {Object.entries(editedFields).map(([key, value]) => (
                  <TextInput
                    key={key}
                    label={key === "value" ? "Value" : key}
                    value={value}
                    onChange={e => handleFieldChange(key, e.currentTarget.value)}
                    styles={{
                      input: {
                        fontFamily: "monospace",
                        fontSize: "12px",
                      },
                    }}
                  />
                ))}
              </Stack>
            ) : (
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            )}
          </ScrollArea.Autosize>
          <Group justify="right" mt="xs">
            {isEditMode ? (
              <>
                <Button variant="default" size="xs" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button size="xs" onClick={handleSave}>
                  Save
                </Button>
              </>
            ) : (
              <Button variant="light" size="xs" onClick={handleEdit}>
                Edit
              </Button>
            )}
          </Group>
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
