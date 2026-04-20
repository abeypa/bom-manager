' ==============================================================================
' MASTER BOM MANAGER - EXCEL TO JSON EXPORTER (VBA)
' ==============================================================================
' Purpose:  Generates a JSON file supporting 27 engineering data fields
'           compatible with the Bep BOM Ecosystem.
' Location: Save this in an Excel Macro-Enabled Workbook (.xlsm)
' Usage:    1. Fill data from Row 3 (Row 2 is ignored).
'           2. Run GenerateFullPartsJSON macro.
' ==============================================================================

Sub GenerateFullPartsJSON()
    Dim ws As Worksheet
    Dim lastRow As Long, i As Long
    Dim jsonString As String
    Dim fileName As String
    
    Set ws = ThisWorkbook.ActiveSheet
    
    ' Determine last row using PartNumber column (Col B)
    lastRow = ws.Cells(ws.Rows.Count, "B").End(xlUp).Row
    
    If lastRow < 3 Then
        MsgBox "No data found starting from Row 3!", vbExclamation
        Exit Sub
    End If

    ' Start JSON Array
    jsonString = "[" & vbCrLf
    
    ' Loop starting from Row 3 (Ignoring Row 2 as requested)
    For i = 3 To lastRow
        jsonString = jsonString & "  {" & vbCrLf
        
        ' --- 1. Identity & Core ---
        jsonString = jsonString & "    ""PartType"": """ & ws.Cells(i, 1).Value & """," & vbCrLf
        jsonString = jsonString & "    ""PartNumber"": """ & ws.Cells(i, 2).Value & """," & vbCrLf
        jsonString = jsonString & "    ""beperp_part_no"": """ & ws.Cells(i, 3).Value & """," & vbCrLf
        jsonString = jsonString & "    ""description"": """ & CleanJSON(ws.Cells(i, 4).Value) & """," & vbCrLf
        
        ' --- 2. Financials ---
        jsonString = jsonString & "    ""base_price"": " & ValFormat(ws.Cells(i, 5).Value) & "," & vbCrLf
        jsonString = jsonString & "    ""currency"": """ & IIf(ws.Cells(i, 6).Value = "", "INR", ws.Cells(i, 6).Value) & """," & vbCrLf
        jsonString = jsonString & "    ""discount_percent"": " & ValFormat(ws.Cells(i, 7).Value) & "," & vbCrLf
        
        ' --- 3. Supplier & Maker ---
        jsonString = jsonString & "    ""supplier_id"": " & NullOrVal(ws.Cells(i, 8).Value) & "," & vbCrLf
        jsonString = jsonString & "    ""manufacturer"": """ & CleanJSON(ws.Cells(i, 9).Value) & """," & vbCrLf
        jsonString = jsonString & "    ""manufacturer_part_number"": """ & CleanJSON(ws.Cells(i, 10).Value) & """," & vbCrLf
        
        ' --- 4. Inventory ---
        jsonString = jsonString & "    ""stock_quantity"": " & IntVal(ws.Cells(i, 11).Value) & "," & vbCrLf
        jsonString = jsonString & "    ""min_stock_level"": " & IntVal(ws.Cells(i, 12).Value) & "," & vbCrLf
        jsonString = jsonString & "    ""lead_time"": """ & CleanJSON(ws.Cells(i, 13).Value) & """," & vbCrLf
        
        ' --- 5. Mechanical Specs ---
        jsonString = jsonString & "    ""material"": """ & CleanJSON(ws.Cells(i, 14).Value) & """," & vbCrLf
        jsonString = jsonString & "    ""finish"": """ & CleanJSON(ws.Cells(i, 15).Value) & """," & vbCrLf
        jsonString = jsonString & "    ""weight"": " & ValFormat(ws.Cells(i, 16).Value) & "," & vbCrLf
        jsonString = jsonString & "    ""specifications"": """ & CleanJSON(ws.Cells(i, 17).Value) & """," & vbCrLf
        
        ' --- 6. Pneumatic Specs ---
        jsonString = jsonString & "    ""port_size"": """ & CleanJSON(ws.Cells(i, 18).Value) & """," & vbCrLf
        jsonString = jsonString & "    ""operating_pressure"": """ & CleanJSON(ws.Cells(i, 19).Value) & """," & vbCrLf
        
        ' --- 7. Assets & Docs ---
        jsonString = jsonString & "    ""datasheet_url"": """ & CleanJSON(ws.Cells(i, 20).Value) & """," & vbCrLf
        jsonString = jsonString & "    ""cad_file_url"": """ & CleanJSON(ws.Cells(i, 21).Value) & """," & vbCrLf
        jsonString = jsonString & "    ""image_path"": """ & CleanJSON(ws.Cells(i, 22).Value) & """," & vbCrLf
        jsonString = jsonString & "    ""pdf_path"": """ & CleanJSON(ws.Cells(i, 23).Value) & """," & vbCrLf
        jsonString = jsonString & "    ""pdf2_path"": """ & CleanJSON(ws.Cells(i, 24).Value) & """," & vbCrLf
        jsonString = jsonString & "    ""pdf3_path"": """ & CleanJSON(ws.Cells(i, 25).Value) & """," & vbCrLf
        
        ' --- 8. Procurement ---
        jsonString = jsonString & "    ""vendor_part_number"": """ & CleanJSON(ws.Cells(i, 26).Value) & """," & vbCrLf
        jsonString = jsonString & "    ""po_number"": """ & CleanJSON(ws.Cells(i, 27).Value) & """" & vbCrLf

        ' Handle trailing commas
        If i = lastRow Then
            jsonString = jsonString & "  }" & vbCrLf
        Else
            jsonString = jsonString & "  }," & vbCrLf
        End If
    Next i
    
    ' Close Array
    jsonString = jsonString & "]"
    
    ' Save File Dialog
    fileName = Application.GetSaveAsFilename(InitialFileName:="parts_upload.json", FileFilter:="JSON Files (*.json), *.json")
    
    If fileName <> "False" Then
        Dim fso As Object: Set fso = CreateObject("Scripting.FileSystemObject")
        Dim oFile As Object: Set oFile = fso.CreateTextFile(fileName)
        oFile.Write jsonString
        oFile.Close
        MsgBox "Full Parts JSON successfully generated!", vbInformation
    End If
End Sub

' --- Helper Functions (Robust & Error-Safe) ---

Function CleanJSON(ByVal cellValue As Variant) As String
    If IsError(cellValue) Or IsEmpty(cellValue) Then
        CleanJSON = ""
    Else
        CleanJSON = Replace(Replace(CStr(cellValue), """", "\"""), vbCrLf, " ")
    End If
End Function

Function ValFormat(ByVal cellValue As Variant) As String
    If IsError(cellValue) Or cellValue = "" Then
        ValFormat = "0.00"
    Else
        ValFormat = Format(Val(cellValue), "0.00")
    End If
End Function

Function IntVal(ByVal cellValue As Variant) As String
    If IsError(cellValue) Or cellValue = "" Then
        IntVal = "0"
    Else
        IntVal = CStr(Int(Val(cellValue)))
    End If
End Function

Function NullOrVal(ByVal cellValue As Variant) As String
    If IsError(cellValue) Or cellValue = "" Then
        NullOrVal = "null"
    Else
        NullOrVal = CStr(Val(cellValue))
    End If
End Function
